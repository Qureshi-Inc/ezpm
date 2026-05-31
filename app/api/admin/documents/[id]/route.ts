/**
 * DELETE /api/admin/documents/[id] — admin deletes any document (either side's
 * upload). Tenants use /api/tenant/documents/[id] for their own uploads.
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { createServerSupabaseClient } from '@/lib/supabase'
import { deleteFile } from '@/lib/storage'

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireAdmin()
    const { id } = await params
    const supabase = createServerSupabaseClient()

    const { data: doc } = await supabase
      .from('documents')
      .select('id, file_path')
      .eq('id', id)
      .maybeSingle()
    if (!doc) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    await supabase.from('documents').delete().eq('id', id)
    await deleteFile(doc.file_path)
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[admin/documents/delete] failed:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
