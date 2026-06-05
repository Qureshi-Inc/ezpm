/**
 * Tenant documents API.
 *   GET  /api/tenant/documents — list the tenant's own document folder
 *                                (includes admin-shared docs for that tenant)
 *   POST /api/tenant/documents — upload one or more documents (multipart)
 *
 * Bidirectional folder: both tenant and admin upload into the same per-tenant
 * folder and both see everything (labeled by uploader). Files are validated +
 * stored by lib/storage and served only via the ownership-checked file route.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getCurrentTenant } from '@/lib/auth'
import { createServerSupabaseClient } from '@/lib/supabase'
import { storeDocument, isAllowedDocType, FileValidationError, MAX_DOC_BYTES } from '@/lib/storage'

const CATEGORIES = ['lease', 'insurance', 'id', 'income', 'notice', 'receipt', 'other']
const MAX_FILES = 10

export async function GET() {
  try {
    const tenant = await getCurrentTenant()
    if (!tenant) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const supabase = createServerSupabaseClient()
    const { data, error } = await supabase
      .from('documents')
      .select('id, category, file_name, content_type, size_bytes, uploaded_by_role, created_at')
      .eq('tenant_id', tenant.id)
      .order('created_at', { ascending: false })
    if (error) {
      console.error('[documents/list] db error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ documents: data ?? [] })
  } catch (err) {
    console.error('[documents/list] failed:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const tenant = await getCurrentTenant()
    if (!tenant) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const form = await request.formData()
    const category = String(form.get('category') || 'other')
    const files = form
      .getAll('documents')
      .filter((f): f is File => typeof f !== 'string' && typeof (f as Blob).arrayBuffer === 'function' && f.size > 0)

    if (!CATEGORIES.includes(category)) {
      return NextResponse.json({ error: 'Invalid category.' }, { status: 400 })
    }
    if (files.length === 0) {
      return NextResponse.json({ error: 'Pick at least one file to upload.' }, { status: 400 })
    }
    if (files.length > MAX_FILES) {
      return NextResponse.json({ error: `Too many files (max ${MAX_FILES}).` }, { status: 400 })
    }
    for (const f of files) {
      if (!isAllowedDocType(f.type)) {
        return NextResponse.json(
          { error: `"${f.name}": unsupported type. Use PDF, images, Word, Excel, TXT, or CSV.` },
          { status: 400 },
        )
      }
      if (f.size > MAX_DOC_BYTES) {
        return NextResponse.json({ error: `"${f.name}" is too large (max 25 MB).` }, { status: 400 })
      }
    }

    const supabase = createServerSupabaseClient()
    const inserted: unknown[] = []
    for (const f of files) {
      try {
        const stored = await storeDocument(tenant.id, f)
        const { data } = await supabase
          .from('documents')
          .insert({
            tenant_id: tenant.id,
            category,
            file_path: stored.relativePath,
            file_name: stored.displayName,
            content_type: stored.contentType,
            size_bytes: stored.sizeBytes,
            uploaded_by_role: 'tenant',
            uploaded_by_user_id: tenant.user_id ?? null,
          })
          .select('id, category, file_name, content_type, size_bytes, uploaded_by_role, created_at')
          .single()
        if (data) inserted.push(data)
      } catch (err) {
        if (err instanceof FileValidationError) {
          return NextResponse.json({ error: err.message }, { status: 400 })
        }
        throw err
      }
    }

    return NextResponse.json({ success: true, documents: inserted })
  } catch (err) {
    console.error('[documents/create] failed:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
