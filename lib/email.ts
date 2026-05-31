/**
 * Transactional email for EZPM — branded receipts on successful rent payment.
 *
 * Uses Brevo's HTTP transactional API (no SMTP/nodemailer dependency, just
 * fetch). FIRE-AND-FORGET: send failures are logged and swallowed so they can
 * never break the Stripe webhook handler.
 *
 * Configuration:
 *   BREVO_API_KEY        - Brevo API key (Brevo → SMTP & API → API Keys,
 *                          format xkeysib-...). Different from the SMTP key
 *                          used by Zitadel.
 *   EMAIL_FROM_ADDRESS   - sender address, e.g. receipts@getezpm.com
 *                          (must be a verified sender/domain in Brevo)
 *   EMAIL_FROM_NAME      - sender display name, default "EZPM"
 *   EMAIL_REPLY_TO       - optional reply-to (e.g. hello@getezpm.com)
 *
 * If BREVO_API_KEY is unset, all sends are silent no-ops (no errors).
 */

const BREVO_API = 'https://api.brevo.com/v3/smtp/email'
const API_KEY = process.env.BREVO_API_KEY
const FROM_ADDRESS = process.env.EMAIL_FROM_ADDRESS || 'receipts@getezpm.com'
const FROM_NAME = process.env.EMAIL_FROM_NAME || 'EZPM'
const REPLY_TO = process.env.EMAIL_REPLY_TO || 'hello@getezpm.com'

export interface SendEmailInput {
  to: string
  toName?: string
  subject: string
  html: string
}

/**
 * Send one transactional email. Returns true on success, false on any failure
 * (including unconfigured). Never throws.
 */
export async function sendEmail(input: SendEmailInput): Promise<boolean> {
  if (!API_KEY) {
    return false // unconfigured — silently skip
  }
  try {
    const res = await fetch(BREVO_API, {
      method: 'POST',
      headers: {
        'api-key': API_KEY,
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify({
        sender: { name: FROM_NAME, email: FROM_ADDRESS },
        to: [{ email: input.to, name: input.toName || input.to }],
        replyTo: { email: REPLY_TO, name: FROM_NAME },
        subject: input.subject,
        htmlContent: input.html,
      }),
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      console.warn(`[email] Brevo returned ${res.status}: ${body.slice(0, 200)}`)
      return false
    }
    return true
  } catch (err) {
    console.warn('[email] send failed (non-fatal):', err instanceof Error ? err.message : err)
    return false
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Receipt template
// ──────────────────────────────────────────────────────────────────────────────

export interface ReceiptData {
  tenantName: string
  tenantEmail: string
  amount: number              // dollars, e.g. 1500.00
  invoiceId: string
  paidDate: Date
  propertyAddress?: string | null
  propertyUnit?: string | null
  paymentMethodType?: string | null  // 'card' | 'us_bank_account'
  paymentMethodLast4?: string | null
}

function money(n: number): string {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
}

function longDate(d: Date): string {
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * Renders the branded HTML receipt. Email-safe: table layout, all inline
 * styles, web-safe fonts (Georgia for the Fraunces-like display voice since
 * email clients won't load @font-face). Palette matches getezpm.com:
 * cream canvas, white card, deep teal, warm ink, leaf-green "paid".
 */
export function renderReceiptEmail(data: ReceiptData): { subject: string; html: string } {
  const cream = '#FAF6EE'
  const card = '#FFFFFF'
  const ink = '#2A2520'
  const ink2 = '#5C534A'
  const muted = '#897F73'
  const teal = '#0D7377'
  const leaf = '#4D8B5C'
  const border = '#E8DFC9'
  const serif = "Georgia, 'Times New Roman', serif"
  const sans = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"

  const propertyLine = data.propertyAddress
    ? escapeHtml(data.propertyAddress) + (data.propertyUnit ? `, Unit ${escapeHtml(data.propertyUnit)}` : '')
    : 'Your residence'

  const methodLabel = data.paymentMethodType === 'us_bank_account'
    ? `Bank account ${data.paymentMethodLast4 ? '••' + escapeHtml(data.paymentMethodLast4) : '(ACH)'}`
    : data.paymentMethodType === 'card'
      ? `Card ${data.paymentMethodLast4 ? '••' + escapeHtml(data.paymentMethodLast4) : ''}`
      : 'On file'

  const subject = `Receipt — ${money(data.amount)} rent payment received`

  const row = (label: string, value: string) => `
    <tr>
      <td style="padding:10px 0;border-bottom:1px solid ${border};font-family:${sans};font-size:13px;color:${muted};">${label}</td>
      <td style="padding:10px 0;border-bottom:1px solid ${border};font-family:${sans};font-size:14px;color:${ink};text-align:right;font-weight:600;">${value}</td>
    </tr>`

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="color-scheme" content="light">
<title>${subject}</title>
</head>
<body style="margin:0;padding:0;background-color:${cream};">
  <!-- preheader (hidden) -->
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">
    Your ${money(data.amount)} rent payment was received. Thank you!
  </div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${cream};">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">

          <!-- Brand header -->
          <tr>
            <td style="padding:0 4px 24px 4px;">
              <table role="presentation" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="background-color:${teal};border-radius:9px;width:34px;height:34px;text-align:center;vertical-align:middle;font-family:${serif};font-size:14px;font-weight:bold;color:${cream};">ez</td>
                  <td style="padding-left:10px;font-family:${serif};font-size:20px;font-weight:bold;color:${ink};">EZPM</td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Card -->
          <tr>
            <td style="background-color:${card};border:1px solid ${border};border-radius:18px;padding:36px 32px;">

              <!-- Paid badge -->
              <table role="presentation" cellpadding="0" cellspacing="0" style="margin-bottom:18px;">
                <tr>
                  <td style="background-color:#E2EDE1;border-radius:999px;padding:6px 14px;font-family:${sans};font-size:12px;font-weight:700;color:${leaf};letter-spacing:0.02em;">
                    ✓ PAYMENT RECEIVED
                  </td>
                </tr>
              </table>

              <h1 style="margin:0 0 6px 0;font-family:${serif};font-size:30px;font-weight:normal;color:${ink};line-height:1.15;">
                Thank you, ${escapeHtml(data.tenantName)}.
              </h1>
              <p style="margin:0 0 24px 0;font-family:${sans};font-size:15px;color:${ink2};line-height:1.5;">
                We&rsquo;ve received your rent payment. Here&rsquo;s your receipt for your records.
              </p>

              <!-- Amount -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${cream};border-radius:14px;margin-bottom:24px;">
                <tr>
                  <td style="padding:22px 24px;text-align:center;">
                    <div style="font-family:${sans};font-size:12px;font-weight:600;color:${muted};text-transform:uppercase;letter-spacing:0.06em;margin-bottom:6px;">Amount paid</div>
                    <div style="font-family:${serif};font-size:44px;font-weight:normal;color:${teal};line-height:1;">${money(data.amount)}</div>
                  </td>
                </tr>
              </table>

              <!-- Details -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                ${row('Date paid', longDate(data.paidDate))}
                ${row('Property', propertyLine)}
                ${row('Payment method', methodLabel)}
                <tr>
                  <td style="padding:10px 0;font-family:${sans};font-size:13px;color:${muted};">Receipt #</td>
                  <td style="padding:10px 0;font-family:'Courier New',monospace;font-size:12px;color:${ink2};text-align:right;">${escapeHtml(data.invoiceId)}</td>
                </tr>
              </table>

            </td>
          </tr>

          <!-- Help note -->
          <tr>
            <td style="padding:20px 8px 0 8px;">
              <p style="margin:0;font-family:${sans};font-size:13px;color:${ink2};line-height:1.5;">
                This payment was processed securely by Stripe. No action is needed — your
                auto-pay remains active for next month. Questions about your account?
                Just reply to this email.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:24px 8px;border-top:1px solid ${border};margin-top:8px;">
              <p style="margin:0 0 4px 0;font-family:${sans};font-size:12px;color:${muted};">
                EZPM &middot; <a href="https://app.getezpm.com" style="color:${teal};text-decoration:none;">app.getezpm.com</a>
              </p>
              <p style="margin:0;font-family:${sans};font-size:11px;color:${muted};">
                You received this because you have an active rental account with EZPM.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`

  return { subject, html }
}

/**
 * Fire-and-forget: render + send a receipt. Returns nothing; logs on failure.
 */
export async function sendReceipt(data: ReceiptData): Promise<void> {
  const { subject, html } = renderReceiptEmail(data)
  await sendEmail({ to: data.tenantEmail, toName: data.tenantName, subject, html })
}
