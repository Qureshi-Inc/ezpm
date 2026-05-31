/**
 * Mattermost notification helpers for EZPM operational events.
 *
 * Sends one-way webhook messages to a Mattermost bot account.
 * All functions are FIRE-AND-FORGET — they never throw, never await-block
 * critical paths. A Mattermost outage silently logs a warning and the caller
 * continues unaffected.
 *
 * Configuration (single env var):
 *   MATTERMOST_WEBHOOK_URL=https://mm.qureshi.io/hooks/<token>
 *
 * Bot account: 54doh4cy7ig8fpphwtqfw3h98c  (server: mm.qureshi.io)
 *
 * Usage:
 *   import { notify } from '@/lib/notify'
 *   notify.tenantSignedUp({ email, firstName, lastName })
 *   notify.subscriptionCreated({ email, firstName, rentAmount, paymentMethodType })
 *   notify.rentCharged({ email, firstName, amount, invoiceId })
 *
 * Adding new notification types:
 *   1. Add a function below that calls send() with the message you want.
 *   2. Import and call it from the relevant route/handler.
 *   3. Done — no schema changes, no DB changes, no config changes.
 */

const WEBHOOK_URL = process.env.MATTERMOST_WEBHOOK_URL

/**
 * Send a raw payload to Mattermost. Returns true on success, false on any error.
 * Never throws.
 */
async function send(payload: {
  text: string
  username?: string
  icon_emoji?: string
}): Promise<boolean> {
  if (!WEBHOOK_URL) {
    return false // unconfigured — silently skip, not an error
  }
  try {
    const res = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: payload.username ?? 'EZPM',
        icon_emoji: payload.icon_emoji ?? ':house:',
        text: payload.text,
      }),
      signal: AbortSignal.timeout(5000), // never hang the caller
    })
    if (!res.ok) {
      console.warn(`[notify] Mattermost webhook returned ${res.status}`)
      return false
    }
    return true
  } catch (err) {
    console.warn('[notify] Mattermost delivery failed (non-fatal):', err instanceof Error ? err.message : err)
    return false
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Event types
// ──────────────────────────────────────────────────────────────────────────────

export interface TenantSignedUpPayload {
  email: string
  firstName: string | null
  lastName: string | null
}

export interface SubscriptionCreatedPayload {
  email: string
  firstName: string | null
  lastName: string | null
  rentAmount: number
  paymentMethodType: 'card' | 'us_bank_account' | string
}

export interface RentChargedPayload {
  email: string
  firstName: string | null
  lastName: string | null
  amount: number           // in dollars (e.g. 1.00 not 100)
  invoiceId: string
}

export interface RentFailedPayload {
  email: string
  firstName: string | null
  lastName: string | null
  amount: number           // in dollars
  invoiceId: string
  reason: 'payment_failed' | 'uncollectible'
}

// ──────────────────────────────────────────────────────────────────────────────
// Public API
// ──────────────────────────────────────────────────────────────────────────────

export const notify = {
  /**
   * Fires when a new tenant logs in for the first time and their row is
   * provisioned in the EZPM users table (via provision_user_from_zitadel RPC).
   * Admin logins are excluded — only role=tenant triggers this.
   */
  tenantSignedUp(payload: TenantSignedUpPayload): void {
    const name = [payload.firstName, payload.lastName].filter(Boolean).join(' ') || payload.email
    void send({
      icon_emoji: ':wave:',
      text: `**New tenant signed up** — ${name} (${payload.email})`,
    })
  },

  /**
   * Fires when Stripe Subscription is created for a tenant (first verified
   * payment method added + property assigned).
   */
  subscriptionCreated(payload: SubscriptionCreatedPayload): void {
    const name = [payload.firstName, payload.lastName].filter(Boolean).join(' ') || payload.email
    const method = payload.paymentMethodType === 'us_bank_account' ? 'bank account (ACH)' : 'card'
    const amount = payload.rentAmount.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
    void send({
      icon_emoji: ':white_check_mark:',
      text: `**Tenant subscribed** — ${name} (${payload.email}) enrolled in auto-pay at ${amount}/month via ${method}`,
    })
  },

  /**
   * Fires when a rent payment fails or is marked uncollectible.
   * (invoice.payment_failed or invoice.marked_uncollectible webhook)
   */
  rentFailed(payload: RentFailedPayload): void {
    const name = [payload.firstName, payload.lastName].filter(Boolean).join(' ') || payload.email
    const amount = payload.amount.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
    const label = payload.reason === 'uncollectible' ? 'marked uncollectible' : 'failed'
    void send({
      icon_emoji: ':rotating_light:',
      text: `**Rent payment ${label}** — ${amount} from ${name} (${payload.email}) · invoice \`${payload.invoiceId}\` — check Stripe Dashboard`,
    })
  },

  /**
   * Fires when Stripe confirms a successful invoice payment
   * (invoice.payment_succeeded webhook → mirrorInvoice).
   */
  rentCharged(payload: RentChargedPayload): void {
    const name = [payload.firstName, payload.lastName].filter(Boolean).join(' ') || payload.email
    const amount = payload.amount.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
    void send({
      icon_emoji: ':moneybag:',
      text: `**Rent charged** — ${amount} collected from ${name} (${payload.email}) · invoice \`${payload.invoiceId}\``,
    })
  },
}
