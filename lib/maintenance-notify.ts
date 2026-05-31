/**
 * Notify a tenant by email when the property manager replies to their
 * maintenance request. Shared by both reply paths:
 *   - the in-app thread (POST /api/maintenance/[id]/comments, admin author)
 *   - inbound Mattermost replies (POST /api/webhooks/mattermost)
 *
 * Fire-and-forget: looks up the tenant + request, renders the branded reply
 * email, and sends it. Never throws.
 */

import { createServerSupabaseClient } from '@/lib/supabase'
import { sendMaintenanceReplyEmail } from '@/lib/email'

export async function notifyTenantOfReply(requestId: string, replyBody: string): Promise<void> {
  try {
    const supabase = createServerSupabaseClient()
    const { data: req } = await supabase
      .from('maintenance_requests')
      .select('id, title, tenant:tenants(email, first_name, last_name)')
      .eq('id', requestId)
      .maybeSingle()
    if (!req) return

    const tenant = req.tenant as unknown as
      | { email: string | null; first_name: string | null; last_name: string | null }
      | null
    if (!tenant?.email) return

    const appUrl = (process.env.NEXT_PUBLIC_APP_URL || 'https://app.getezpm.com').replace(/\/$/, '')
    await sendMaintenanceReplyEmail({
      tenantName: [tenant.first_name, tenant.last_name].filter(Boolean).join(' ') || tenant.email,
      tenantEmail: tenant.email,
      requestTitle: req.title,
      replyBody,
      requestUrl: `${appUrl}/tenant/maintenance/${req.id}`,
    })
  } catch (err) {
    console.warn('[maintenance-notify] reply email failed (non-fatal):', err instanceof Error ? err.message : err)
  }
}
