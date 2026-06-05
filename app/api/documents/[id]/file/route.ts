/**
 * GET /api/documents/[id]/file
 *
 * Streams a document — ONLY to the tenant who owns the folder or any admin.
 * No public URL; files live on the mounted volume and are read by
 * lib/storage.readAttachment after this ownership gate.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { createServerSupabaseClient } from '@/lib/supabase'
import { readAttachment } from '@/lib/storage'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const { id } = await params
    const supabase = createServerSupabaseClient()

    const { data: doc } = await supabase
      .from('documents')
      .select('file_path, file_name, content_type, tenant_id')
      .eq('id', id)
      .maybeSingle()

    if (!doc) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    if (session.role !== 'admin') {
      const { data: tenant } = await supabase
        .from('tenants')
        .select('id')
        .eq('user_id', session.userId)
        .maybeSingle()
      if (!tenant || tenant.id !== doc.tenant_id) {
        return NextResponse.json({ error: 'Not found' }, { status: 404 })
      }
    }

    const bytes = await readAttachment(doc.file_path)
    return new NextResponse(new Uint8Array(bytes), {
      status: 200,
      headers: {
        'Content-Type': doc.content_type || 'application/octet-stream',
        'Content-Disposition': `inline; filename="${encodeURIComponent(doc.file_name)}"`,
        'Cache-Control': 'private, max-age=0, no-store',
      },
    })
  } catch (err) {
    console.error('[documents/file] serve error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
