/**
 * Single source of truth for changing a maintenance request's status.
 * Used by the admin web UI (PATCH /api/admin/maintenance/[id]), the Mattermost
 * status BUTTONS (POST /api/webhooks/mattermost-action), tenant cancel, and the
 * legacy emoji webhook — so every path behaves identically: update the DB, email
 * + text the tenant (if opted in), and re-render the Mattermost status buttons.
 */

import { createServerSupabaseClient } from '@/lib/supabase'
import { sendMaintenanceStatusEmail, type MaintenanceStatus } from '@/lib/email'
import { reactMaintenanceStatus } from '@/lib/mattermost'
import { sendSMS } from '@/lib/sms'

export const MAINT_STATUSES: MaintenanceStatus[] = ['open', 'in_progress', 'resolved', 'cancelled']

const STATUS_LABELS: Record<MaintenanceStatus, string> = {
  open: 'open',
  in_progress: 'in progress',
  resolved: 'resolved',
  cancelled: 'cancelled',
}

interface TenantRow {
  email: string | null
  phone: string | null
  first_name: string | null
  last_name: string | null
  notify_maintenance_status: boolean | null
  notify_sms: boolean | null
}
interface PropertyRow {
  address: string | null
  unit_number: string | null
}

/**
 * Apply a status to a request. `react` controls whether we (re)assert the emoji
 * on Mattermost; `fromReaction` means a human's reaction already supplied the
 * emoji, so the bot shouldn't add a duplicate copy.
 * Returns whether the status actually changed (so callers can skip a no-op email).
 */
export async function applyMaintenanceStatus(
  requestId: string,
  status: MaintenanceStatus,
  opts: { react?: boolean; fromReaction?: boolean } = {},
): Promise<{ ok: boolean; changed: boolean; notFound?: boolean }> {
  const supabase = createServerSupabaseClient()
  const reactOpts = { addOwn: !opts.fromReaction }

  const { data: req } = await supabase
    .from('maintenance_requests')
    .select(
      'id, status, title, mattermost_root_id, tenant:tenants(email, phone, first_name, last_name, notify_maintenance_status, notify_sms), property:properties(address, unit_number)',
    )
    .eq('id', requestId)
    .maybeSingle()

  if (!req) return { ok: false, changed: false, notFound: true }

  if (req.status === status) {
    if (opts.react !== false) void reactMaintenanceStatus(req.mattermost_root_id, status, reactOpts)
    return { ok: true, changed: false }
  }

  const update: Record<string, unknown> = { status }
  update.resolved_at = status === 'resolved' ? new Date().toISOString() : null
  const { error } = await supabase.from('maintenance_requests').update(update).eq('id', requestId)
  if (error) return { ok: false, changed: false }

  const tenant = req.tenant as unknown as TenantRow | null
  const property = req.property as unknown as PropertyRow | null
  if (tenant?.email && tenant.notify_maintenance_status !== false) {
    void sendMaintenanceStatusEmail({
      tenantName: [tenant.first_name, tenant.last_name].filter(Boolean).join(' ') || tenant.email,
      tenantEmail: tenant.email,
      requestTitle: req.title,
      status,
      propertyAddress: property?.address ?? null,
      propertyUnit: property?.unit_number ?? null,
    })
  }

  // SMS — separate opt-in (default off), only if a phone is on file.
  if (tenant?.notify_sms === true && tenant.phone) {
    const appUrl = (process.env.NEXT_PUBLIC_APP_URL || 'https://app.getezpm.com').replace(/\/$/, '')
    void sendSMS({
      to: tenant.phone,
      body: `EZPM: Maintenance request "${req.title}" is now ${STATUS_LABELS[status]}.\nView: ${appUrl}/tenant/maintenance/${req.id}`,
    })
  }

  if (opts.react !== false) void reactMaintenanceStatus(req.mattermost_root_id, status, reactOpts)
  return { ok: true, changed: true }
}
