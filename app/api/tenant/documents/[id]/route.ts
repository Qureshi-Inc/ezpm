/**
 * DELETE /api/tenant/documents/[id] — a tenant deletes a document THEY uploaded.
 * Tenants can only delete their own uploads (uploaded_by_role='tenant' on their
 * own folder); admin-shared docs can only be removed by an admin.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getCurrentTenant } from '@/lib/auth'
import { createServerSupabaseClient } from '@/lib/supabase'
import { deleteFile } from '@/lib/storage'

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const tenant = await getCurrentTenant()
    if (!tenant) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const { id } = await params
    const supabase = createServerSupabaseClient()

    const { data: doc } = await supabase
      .from('documents')
      .select('id, tenant_id, file_path, uploaded_by_role')
      .eq('id', id)
      .maybeSingle()

    if (!doc || doc.tenant_id !== tenant.id) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    if (doc.uploaded_by_role !== 'tenant') {
      return NextResponse.json(
        { error: 'This document was shared by your property manager and can only be removed by them.' },
        { status: 403 },
      )
    }

    await supabase.from('documents').delete().eq('id', id)
    await deleteFile(doc.file_path)
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[documents/delete] failed:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
