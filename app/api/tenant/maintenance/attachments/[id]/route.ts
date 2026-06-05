/**
 * GET /api/tenant/maintenance/attachments/[id]
 *
 * Streams a maintenance photo/PDF — but ONLY to someone authorized to see it:
 *   - the tenant who owns the parent request, OR
 *   - any admin.
 *
 * This is the single gate that keeps tenant A from viewing tenant B's photos.
 * There is NO public URL for these files; they live outside the web root on a
 * mounted volume and are read by lib/storage.readAttachment after this check.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { createServerSupabaseClient } from '@/lib/supabase'
import { readAttachment, canViewAttachment } from '@/lib/storage'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getSession()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const { id } = await params
    const supabase = createServerSupabaseClient()

    // Load the attachment + its parent request's owning tenant in one query.
    const { data: attachment } = await supabase
      .from('maintenance_attachments')
      .select('file_path, file_name, content_type, maintenance_requests(tenant_id)')
      .eq('id', id)
      .maybeSingle()

    if (!attachment) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    // Ownership check. Admins can view any; tenants only their own request's.
    // Resolve the session's tenant id (null for admins) for the pure decision.
    let sessionTenantId: string | null = null
    if (session.role !== 'admin') {
      const { data: tenant } = await supabase
        .from('tenants')
        .select('id')
        .eq('user_id', session.userId)
        .maybeSingle()
      sessionTenantId = tenant?.id ?? null
    }
    const req = attachment.maintenance_requests as unknown as { tenant_id: string } | null
    if (!canViewAttachment({ role: session.role, sessionTenantId, requestTenantId: req?.tenant_id ?? null })) {
      // 404 (not 403) so we don't confirm the attachment exists to a stranger.
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const bytes = await readAttachment(attachment.file_path)
    return new NextResponse(new Uint8Array(bytes), {
      status: 200,
      headers: {
        'Content-Type': attachment.content_type || 'application/octet-stream',
        'Content-Disposition': `inline; filename="${encodeURIComponent(attachment.file_name)}"`,
        'Cache-Control': 'private, max-age=0, no-store',
      },
    })
  } catch (err) {
    console.error('Attachment serve error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
