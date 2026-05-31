/**
 * Maintenance request comments (Phase 2 — two-way updates thread).
 *   GET  /api/maintenance/[id]/comments — list the thread (tenant owner or admin)
 *   POST /api/maintenance/[id]/comments — add a comment (+ optional photos)
 *
 * Both roles share this route; authorization gates on request ownership. New
 * comments reply under the request's Mattermost thread (root_id), carrying any
 * photos so the landlord sees the back-and-forth in one place.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { createServerSupabaseClient } from '@/lib/supabase'
import {
  storeAttachment,
  isAllowedType,
  FileValidationError,
  MAX_FILE_BYTES,
  MAX_FILES_PER_REQUEST,
} from '@/lib/storage'
import { postMaintenanceMessage, type MattermostUpload } from '@/lib/mattermost'
import { notifyTenantOfReply } from '@/lib/maintenance-notify'

interface AttachmentRow {
  id: string
  comment_id: string | null
  file_name: string
  content_type: string
}

async function authorize(requestId: string) {
  const session = await getSession()
  if (!session) return { error: 'Unauthorized', status: 401 as const }
  const supabase = createServerSupabaseClient()
  const { data: req } = await supabase
    .from('maintenance_requests')
    .select('id, tenant_id, title, mattermost_root_id')
    .eq('id', requestId)
    .maybeSingle()
  if (!req) return { error: 'Not found', status: 404 as const }

  if (session.role !== 'admin') {
    const { data: tenant } = await supabase
      .from('tenants')
      .select('id')
      .eq('user_id', session.userId)
      .maybeSingle()
    if (!tenant || tenant.id !== req.tenant_id) {
      return { error: 'Not found', status: 404 as const }
    }
  }
  return { session, supabase, req }
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const auth = await authorize(id)
    if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })
    const { supabase } = auth

    const { data: comments } = await supabase
      .from('maintenance_comments')
      .select('id, author_role, body, created_at')
      .eq('request_id', id)
      .order('created_at', { ascending: true })

    const list = comments ?? []
    let attachments: AttachmentRow[] = []
    if (list.length > 0) {
      const { data: att } = await supabase
        .from('maintenance_attachments')
        .select('id, comment_id, file_name, content_type')
        .in('comment_id', list.map((c) => c.id))
      attachments = (att ?? []) as AttachmentRow[]
    }

    const withAttachments = list.map((c) => ({
      ...c,
      attachments: attachments.filter((a) => a.comment_id === c.id),
    }))
    return NextResponse.json(
      { comments: withAttachments },
      { headers: { 'Cache-Control': 'private, no-store, max-age=0' } },
    )
  } catch (err) {
    console.error('[maintenance/comments/list] failed:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const auth = await authorize(id)
    if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })
    const { session, supabase, req } = auth

    const form = await request.formData()
    const body = String(form.get('body') || '').trim()
    const files = form
      .getAll('photos')
      .filter((f): f is File => typeof f !== 'string' && typeof (f as Blob).arrayBuffer === 'function' && f.size > 0)

    if (!body && files.length === 0) {
      return NextResponse.json({ error: 'Write a message or attach a photo.' }, { status: 400 })
    }
    if (body.length > 4000) {
      return NextResponse.json({ error: 'Message is too long.' }, { status: 400 })
    }
    if (files.length > MAX_FILES_PER_REQUEST) {
      return NextResponse.json({ error: `Too many photos (max ${MAX_FILES_PER_REQUEST}).` }, { status: 400 })
    }
    for (const f of files) {
      if (!isAllowedType(f.type)) {
        return NextResponse.json({ error: `"${f.name}": unsupported type.` }, { status: 400 })
      }
      if (f.size > MAX_FILE_BYTES) {
        return NextResponse.json({ error: `"${f.name}" is too large (max 10 MB).` }, { status: 400 })
      }
    }

    const { data: comment, error: insertError } = await supabase
      .from('maintenance_comments')
      .insert({
        request_id: id,
        author_role: session.role,
        author_user_id: session.userId,
        body: body || '(photo)',
      })
      .select('id, author_role, body, created_at')
      .single()
    if (insertError || !comment) {
      console.error('[maintenance/comments/create] insert error:', insertError)
      return NextResponse.json({ error: 'Failed to post comment.' }, { status: 500 })
    }

    const mmUploads: MattermostUpload[] = []
    const storedAttachments: AttachmentRow[] = []
    for (const f of files) {
      try {
        const stored = await storeAttachment(id, f)
        const { data: att } = await supabase
          .from('maintenance_attachments')
          .insert({
            request_id: id,
            comment_id: comment.id,
            file_path: stored.relativePath,
            file_name: stored.displayName,
            content_type: stored.contentType,
            size_bytes: stored.sizeBytes,
            uploaded_by_role: session.role,
          })
          .select('id, comment_id, file_name, content_type')
          .single()
        if (att) storedAttachments.push(att as AttachmentRow)
        mmUploads.push({ filename: stored.displayName, contentType: stored.contentType, bytes: await f.arrayBuffer() })
      } catch (err) {
        if (!(err instanceof FileValidationError)) console.error('Comment attachment failed:', err)
      }
    }

    // Reply under the request's Mattermost thread (non-blocking).
    if (req.mattermost_root_id) {
      const who = session.role === 'admin' ? 'Manager' : 'Tenant'
      const msg = `💬 **${who} replied:** ${body || '_(photo)_'}`
      void postMaintenanceMessage(msg, { rootId: req.mattermost_root_id, files: mmUploads }).catch(() => {})
    }

    // When the property manager replies, email the tenant with the message +
    // a link back to the request. (Tenant's own replies don't email themselves.)
    if (session.role === 'admin') {
      void notifyTenantOfReply(id, body || '(photo)')
    }

    return NextResponse.json({
      success: true,
      comment: { ...comment, attachments: storedAttachments },
    })
  } catch (err) {
    console.error('[maintenance/comments/create] failed:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
