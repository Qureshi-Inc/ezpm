/**
 * Single source of truth for changing a maintenance request's status.
 * Used by the admin web UI (PATCH /api/admin/maintenance/[id]) AND by inbound
 * Mattermost emoji reactions (POST /api/webhooks/mattermost-reaction), so both
 * paths behave identically: update the DB, email the tenant (if they haven't
 * opted out), and reflect the status as an emoji on the Mattermost root post.
 */

import { createServerSupabaseClient } from '@/lib/supabase'
import { sendMaintenanceStatusEmail, type MaintenanceStatus } from '@/lib/email'
import { reactMaintenanceStatus } from '@/lib/mattermost'

export const MAINT_STATUSES: MaintenanceStatus[] = ['open', 'in_progress', 'resolved', 'cancelled']

interface TenantRow {
  email: string | null
  first_name: string | null
  last_name: string | null
  notify_maintenance_status: boolean | null
}
interface PropertyRow {
  address: string | null
  unit_number: string | null
}

/**
 * Apply a status to a request. `react` controls whether we (re)assert the emoji
 * on Mattermost — true for app-driven changes; for reaction-driven changes it's
 * still safe (idempotent + clears stale status emojis).
 * Returns whether the status actually changed (so callers can skip a no-op email).
 */
export async function applyMaintenanceStatus(
  requestId: string,
  status: MaintenanceStatus,
  opts: { react?: boolean } = {},
): Promise<{ ok: boolean; changed: boolean; notFound?: boolean }> {
  const supabase = createServerSupabaseClient()

  const { data: req } = await supabase
    .from('maintenance_requests')
    .select(
      'id, status, title, mattermost_root_id, tenant:tenants(email, first_name, last_name, notify_maintenance_status), property:properties(address, unit_number)',
    )
    .eq('id', requestId)
    .maybeSingle()

  if (!req) return { ok: false, changed: false, notFound: true }

  if (req.status === status) {
    if (opts.react !== false) void reactMaintenanceStatus(req.mattermost_root_id, status)
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

  if (opts.react !== false) void reactMaintenanceStatus(req.mattermost_root_id, status)
  return { ok: true, changed: true }
}
