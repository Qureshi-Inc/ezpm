/**
 * PATCH /api/tenant/maintenance/[id] — tenant cancels their OWN open request.
 *
 * The only status transition a tenant may make is open → cancelled. Everything
 * else (in_progress, resolved) is admin-only via the admin route. Scoped to the
 * tenant's own requests.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getCurrentTenant } from '@/lib/auth'
import { createServerSupabaseClient } from '@/lib/supabase'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const tenant = await getCurrentTenant()
    if (!tenant) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const { id } = await params
    const { action } = await request.json().catch(() => ({ action: undefined }))
    if (action !== 'cancel') {
      return NextResponse.json({ error: 'Only "cancel" is supported.' }, { status: 400 })
    }

    const supabase = createServerSupabaseClient()
    const { data: req } = await supabase
      .from('maintenance_requests')
      .select('id, tenant_id, status')
      .eq('id', id)
      .maybeSingle()

    if (!req || req.tenant_id !== tenant.id) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    if (req.status !== 'open') {
      return NextResponse.json(
        { error: 'Only an open request can be cancelled.' },
        { status: 400 },
      )
    }

    const { error } = await supabase
      .from('maintenance_requests')
      .update({ status: 'cancelled' })
      .eq('id', id)
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
