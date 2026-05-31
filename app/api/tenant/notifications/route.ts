/**
 * Tenant notification preferences.
 *   PATCH /api/tenant/notifications — toggle a tenant's email notifications.
 * Body: { notify_maintenance_replies: boolean }
 */

import { NextRequest, NextResponse } from 'next/server'
import { getCurrentTenant } from '@/lib/auth'
import { createServerSupabaseClient } from '@/lib/supabase'

export async function PATCH(request: NextRequest) {
  try {
    const tenant = await getCurrentTenant()
    if (!tenant) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json().catch(() => ({}))
    const update: Record<string, boolean> = {}
    if (typeof body.notify_maintenance_replies === 'boolean') {
      update.notify_maintenance_replies = body.notify_maintenance_replies
    }
    if (typeof body.notify_maintenance_status === 'boolean') {
      update.notify_maintenance_status = body.notify_maintenance_status
    }
    if (typeof body.notify_payment_receipts === 'boolean') {
      update.notify_payment_receipts = body.notify_payment_receipts
    }
    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: 'No valid preference provided.' }, { status: 400 })
    }

    const supabase = createServerSupabaseClient()
    const { error } = await supabase.from('tenants').update(update).eq('id', tenant.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ success: true, ...update })
  } catch (err) {
    console.error('[tenant/notifications] failed:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
