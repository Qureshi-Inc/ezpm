/**
 * Admin documents API (scoped to a tenant's folder).
 *   GET  /api/admin/tenants/[id]/documents — list that tenant's documents
 *   POST /api/admin/tenants/[id]/documents — admin shares one or more docs
 *                                            into the tenant's folder
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { createServerSupabaseClient } from '@/lib/supabase'
import { storeDocument, isAllowedDocType, FileValidationError, MAX_DOC_BYTES } from '@/lib/storage'

const CATEGORIES = ['lease', 'insurance', 'id', 'income', 'notice', 'receipt', 'other']
const MAX_FILES = 10

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireAdmin()
    const { id } = await params
    const supabase = createServerSupabaseClient()
    const { data, error } = await supabase
      .from('documents')
      .select('id, category, file_name, content_type, size_bytes, uploaded_by_role, created_at')
      .eq('tenant_id', id)
      .order('created_at', { ascending: false })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ documents: data ?? [] })
  } catch (err) {
    console.error('[admin/documents/list] failed:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireAdmin()
    const { id } = await params
    const supabase = createServerSupabaseClient()

    const { data: tenant } = await supabase.from('tenants').select('id').eq('id', id).maybeSingle()
    if (!tenant) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })

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

    const inserted: unknown[] = []
    for (const f of files) {
      try {
        const stored = await storeDocument(id, f)
        const { data } = await supabase
          .from('documents')
          .insert({
            tenant_id: id,
            category,
            file_path: stored.relativePath,
            file_name: stored.displayName,
            content_type: stored.contentType,
            size_bytes: stored.sizeBytes,
            uploaded_by_role: 'admin',
            uploaded_by_user_id: session.userId,
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
    console.error('[admin/documents/create] failed:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
