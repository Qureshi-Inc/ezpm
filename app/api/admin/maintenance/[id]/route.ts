/**
 * PATCH /api/admin/maintenance/[id] — admin changes a request's status.
 *
 * Admin-only (requireAdmin). Valid statuses: open | in_progress | resolved |
 * cancelled. On a real change, fires a branded status email to the tenant
 * (fire-and-forget — a mail failure never blocks the status update).
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { createServerSupabaseClient } from '@/lib/supabase'
import { sendMaintenanceStatusEmail, type MaintenanceStatus } from '@/lib/email'
import { reactMaintenanceStatus } from '@/lib/mattermost'

const STATUSES: MaintenanceStatus[] = ['open', 'in_progress', 'resolved', 'cancelled']

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireAdmin()
    const { id } = await params
    const { status } = await request.json().catch(() => ({ status: undefined }))

    if (!STATUSES.includes(status)) {
      return NextResponse.json({ error: 'Invalid status.' }, { status: 400 })
    }

    const supabase = createServerSupabaseClient()

    // Load current state + the tenant/property for the notification email.
    const { data: req } = await supabase
      .from('maintenance_requests')
      .select('id, status, title, mattermost_root_id, tenant:tenants(email, first_name, last_name), property:properties(address, unit_number)')
      .eq('id', id)
      .maybeSingle()

    if (!req) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const update: Record<string, unknown> = { status }
    if (status === 'resolved') update.resolved_at = new Date().toISOString()
    if (status !== 'resolved') update.resolved_at = null

    const { error } = await supabase
      .from('maintenance_requests')
      .update(update)
      .eq('id', id)
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // On a real change: email the tenant AND react on the request's Mattermost
    // root post so the channel shows the live status as a single emoji (instead
    // of stacking status messages in the thread).
    if (req.status !== status) {
      const tenant = req.tenant as unknown as { email: string; first_name: string | null; last_name: string | null } | null
      const property = req.property as unknown as { address: string | null; unit_number: string | null } | null
      if (tenant?.email) {
        void sendMaintenanceStatusEmail({
          tenantName: [tenant.first_name, tenant.last_name].filter(Boolean).join(' ') || tenant.email,
          tenantEmail: tenant.email,
          requestTitle: req.title,
          status: status as MaintenanceStatus,
          propertyAddress: property?.address ?? null,
          propertyUnit: property?.unit_number ?? null,
        })
      }
      void reactMaintenanceStatus(req.mattermost_root_id, status)
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (error instanceof Error && error.message === 'Forbidden') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
