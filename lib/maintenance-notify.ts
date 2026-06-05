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
import { sendSMS } from '@/lib/sms'

export async function notifyTenantOfReply(requestId: string, replyBody: string): Promise<void> {
  try {
    const supabase = createServerSupabaseClient()
    const { data: req } = await supabase
      .from('maintenance_requests')
      .select(
        'id, title, tenant:tenants(email, phone, first_name, last_name, notify_maintenance_replies, notify_sms)',
      )
      .eq('id', requestId)
      .maybeSingle()
    if (!req) return

    const tenant = req.tenant as unknown as
      | {
          email: string | null
          phone: string | null
          first_name: string | null
          last_name: string | null
          notify_maintenance_replies: boolean | null
          notify_sms: boolean | null
        }
      | null
    if (!tenant) return

    const appUrl = (process.env.NEXT_PUBLIC_APP_URL || 'https://app.getezpm.com').replace(/\/$/, '')
    const requestUrl = `${appUrl}/tenant/maintenance/${req.id}`

    // Email — respects the tenant's email preference (default on).
    if (tenant.email && tenant.notify_maintenance_replies !== false) {
      await sendMaintenanceReplyEmail({
        tenantName: [tenant.first_name, tenant.last_name].filter(Boolean).join(' ') || tenant.email,
        tenantEmail: tenant.email,
        requestTitle: req.title,
        replyBody,
        requestUrl,
      })
    }

    // SMS — separate opt-in (default off), only if a phone is on file.
    if (tenant.notify_sms === true && tenant.phone) {
      const snippet = replyBody.replace(/\s+/g, ' ').trim().slice(0, 200)
      void sendSMS({
        to: tenant.phone,
        body: `EZPM: Your property manager replied to "${req.title}". ${snippet}\nView: ${requestUrl}`,
      })
    }
  } catch (err) {
    console.warn('[maintenance-notify] reply notify failed (non-fatal):', err instanceof Error ? err.message : err)
  }
}
