/**
 * Transactional SMS for EZPM via Twilio.
 *
 * Mirrors lib/email.ts: FIRE-AND-FORGET. Send failures (and an unconfigured
 * environment) are logged and swallowed so they can never break a webhook
 * handler or request. Uses Twilio's REST API directly over fetch + HTTP Basic
 * auth — no SDK dependency to keep the install lean.
 *
 * Configuration:
 *   TWILIO_ACCOUNT_SID            - Account SID (ACxxxxx)
 *   TWILIO_AUTH_TOKEN             - Auth Token
 *   TWILIO_MESSAGING_SERVICE_SID  - Messaging Service SID (MGxxxx). Preferred:
 *                                   handles sender pool + A2P 10DLC routing.
 *   TWILIO_FROM                   - Fallback single sender, E.164 (+1XXXXXXXXXX),
 *                                   used only if no Messaging Service SID.
 *
 * If the SID/token and a sender are not all present, every send is a silent
 * no-op (returns false, no error).
 */

const SID = process.env.TWILIO_ACCOUNT_SID
const TOKEN = process.env.TWILIO_AUTH_TOKEN
const FROM = process.env.TWILIO_FROM
const MSG_SVC = process.env.TWILIO_MESSAGING_SERVICE_SID

export function smsConfigured(): boolean {
  return Boolean(SID && TOKEN && (MSG_SVC || FROM))
}

/**
 * Best-effort normalization to E.164. Assumes US (+1) for bare 10-digit numbers
 * and 11-digit numbers starting with 1, since the app is US-only. Returns null
 * if it can't produce something plausible (caller then skips the SMS).
 */
export function toE164(raw: string | null | undefined): string | null {
  if (!raw) return null
  const trimmed = raw.trim()
  if (trimmed.startsWith('+')) {
    const digits = trimmed.replace(/\D/g, '')
    return digits.length >= 8 ? `+${digits}` : null
  }
  const digits = trimmed.replace(/\D/g, '')
  if (digits.length === 10) return `+1${digits}`
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`
  return null
}

/**
 * Send one SMS. Returns true on success, false on any failure (including
 * unconfigured or an unparseable phone number). Never throws.
 */
export async function sendSMS(input: { to: string | null | undefined; body: string }): Promise<boolean> {
  if (!smsConfigured()) return false
  const to = toE164(input.to)
  if (!to) {
    console.warn('[sms] skipping — could not normalize phone to E.164')
    return false
  }
  try {
    const params = new URLSearchParams()
    params.set('To', to)
    if (MSG_SVC) params.set('MessagingServiceSid', MSG_SVC)
    else params.set('From', FROM as string)
    // Keep within a couple of SMS segments; Twilio will split/concatenate.
    params.set('Body', input.body.slice(0, 1000))

    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${SID}/Messages.json`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${SID}:${TOKEN}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    })
    if (!res.ok) {
      const txt = await res.text().catch(() => '')
      console.warn(`[sms] Twilio returned ${res.status}: ${txt.slice(0, 200)}`)
      return false
    }
    return true
  } catch (err) {
    console.warn('[sms] send failed (non-fatal):', err instanceof Error ? err.message : err)
    return false
  }
}
