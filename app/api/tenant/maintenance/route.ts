/**
 * Tenant maintenance API.
 *
 *   GET  /api/tenant/maintenance        — list the tenant's own requests
 *                                          (+ attachment counts, single query)
 *   POST /api/tenant/maintenance        — create a request with photo uploads
 *                                          (multipart/form-data)
 *
 * Security: scoped to the logged-in tenant via getCurrentTenant(). Files are
 * validated server-side (size + type) and stored under the mounted volume with
 * UUID names — see lib/storage.ts. Photos are NEVER returned by a public URL;
 * they're served by the ownership-checked /attachments/[id] route.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getCurrentTenant } from '@/lib/auth'
import { createServerSupabaseClient } from '@/lib/supabase'
import {
  storeAttachment,
  isAllowedType,
  FileValidationError,
  MAX_FILE_BYTES,
  MAX_FILES_PER_REQUEST,
} from '@/lib/storage'
import { postMaintenanceMessage, maintenanceRootAttachments, type MattermostUpload } from '@/lib/mattermost'

const CATEGORIES = ['plumbing', 'electrical', 'appliance', 'hvac', 'other']
const PRIORITIES = ['normal', 'urgent']

export async function GET() {
  try {
    const tenant = await getCurrentTenant()
    if (!tenant) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const supabase = createServerSupabaseClient()
    // Single query: each request row carries its attachment count via the
    // PostgREST embedded-aggregate (no N+1).
    const { data, error } = await supabase
      .from('maintenance_requests')
      .select('*, maintenance_attachments(count)')
      .eq('tenant_id', tenant.id)
      .order('created_at', { ascending: false })
    if (error) {
      console.error('[maintenance/list] db error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ requests: data ?? [] })
  } catch (err) {
    console.error('[maintenance/list] failed:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const tenant = await getCurrentTenant()
    if (!tenant) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const form = await request.formData()
    const title = String(form.get('title') || '').trim()
    const description = String(form.get('description') || '').trim()
    const category = String(form.get('category') || 'other')
    const priority = String(form.get('priority') || 'normal')
    // NB: don't use `instanceof File` — the `File` global only exists in
    // Node >= 20, and the production runtime here is older, which threw
    // "ReferenceError: File is not defined" the moment a photo was attached.
    // A FormData entry is either a string or a Blob/File; duck-type the file.
    const files = form
      .getAll('photos')
      .filter((f): f is File => typeof f !== 'string' && typeof (f as Blob).arrayBuffer === 'function' && f.size > 0)

    if (!title) {
      return NextResponse.json({ error: 'A short title is required.' }, { status: 400 })
    }
    if (title.length > 200) {
      return NextResponse.json({ error: 'Title is too long (max 200 characters).' }, { status: 400 })
    }
    if (!CATEGORIES.includes(category)) {
      return NextResponse.json({ error: 'Invalid category.' }, { status: 400 })
    }
    if (!PRIORITIES.includes(priority)) {
      return NextResponse.json({ error: 'Invalid priority.' }, { status: 400 })
    }
    if (files.length > MAX_FILES_PER_REQUEST) {
      return NextResponse.json(
        { error: `Too many photos (max ${MAX_FILES_PER_REQUEST}).` },
        { status: 400 },
      )
    }

    // Pre-validate ALL files (type + size) BEFORE creating the request or
    // writing anything to disk — so we never leave an orphan request or
    // partial upload. All-or-nothing on create.
    for (const f of files) {
      if (!isAllowedType(f.type)) {
        return NextResponse.json(
          { error: `"${f.name}": unsupported type. Use JPG, PNG, WEBP, HEIC, or PDF.` },
          { status: 400 },
        )
      }
      if (f.size > MAX_FILE_BYTES) {
        return NextResponse.json(
          { error: `"${f.name}" is too large (max 10 MB).` },
          { status: 400 },
        )
      }
    }

    const supabase = createServerSupabaseClient()

    const { data: created, error: insertError } = await supabase
      .from('maintenance_requests')
      .insert({
        tenant_id: tenant.id,
        property_id: tenant.property_id ?? null,
        title,
        description: description || null,
        category,
        priority,
        status: 'open',
      })
      .select()
      .single()

    if (insertError || !created) {
      console.error('[maintenance/create] insert error:', insertError)
      return NextResponse.json(
        { error: `Failed to create request: ${insertError?.message}` },
        { status: 500 },
      )
    }

    // Store each file + mirror an attachments row. Files already passed
    // validation above, so storeAttachment should not throw on type/size.
    // Also collect the bytes so we can attach them to the Mattermost post.
    const mmUploads: MattermostUpload[] = []
    for (const f of files) {
      try {
        const stored = await storeAttachment(created.id, f)
        await supabase.from('maintenance_attachments').insert({
          request_id: created.id,
          file_path: stored.relativePath,
          file_name: stored.displayName,
          content_type: stored.contentType,
          size_bytes: stored.sizeBytes,
          uploaded_by_role: 'tenant',
        })
        mmUploads.push({
          filename: stored.displayName,
          contentType: stored.contentType,
          bytes: await f.arrayBuffer(),
        })
      } catch (err) {
        // A single file failing shouldn't 500 the whole request — the request
        // is saved; log and continue. (Pre-validation makes this rare.)
        if (!(err instanceof FileValidationError)) {
          console.error('Attachment store failed:', err)
        }
      }
    }

    // Post the request as the ROOT of a new thread in the maintenance channel,
    // then remember the post id so status changes reply under it (one thread per
    // request). Non-blocking: a slow/absent Mattermost never delays the tenant.
    const tenantName = [tenant.first_name, tenant.last_name].filter(Boolean).join(' ') || tenant.email
    const urgent = priority === 'urgent'
    const where = tenant.property?.address ? `\n**Where:** ${tenant.property.address}` : ''
    const details = description ? `\n\n${description}` : ''
    const appUrl = (process.env.NEXT_PUBLIC_APP_URL || 'https://app.getezpm.com').replace(/\/$/, '')
    const link = `\n\n[Open in EZPM →](${appUrl}/admin/maintenance/${created.id})`
    const rootMessage =
      `${urgent ? '🚨 ' : '🔧 '}**New maintenance request${urgent ? ' — URGENT' : ''}**\n` +
      `**${title}** _(${category})_\n**Tenant:** ${tenantName}${where}${details}${link}`

    void (async () => {
      try {
        const rootId = await postMaintenanceMessage(rootMessage, {
          files: mmUploads,
          attachments: maintenanceRootAttachments(created.id, 'open'),
        })
        if (rootId) {
          await supabase
            .from('maintenance_requests')
            .update({ mattermost_root_id: rootId })
            .eq('id', created.id)
        }
      } catch (err) {
        console.error('[maintenance/create] mattermost post failed (non-fatal):', err)
      }
    })()

    return NextResponse.json({ success: true, request: created })
  } catch (err) {
    console.error('[maintenance/create] failed:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
