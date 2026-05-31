/**
 * Transactional email for EZPM — branded receipts, maintenance updates, etc.
 *
 * Sends over SMTP (Brevo relay — the same path Zitadel uses for this domain).
 * FIRE-AND-FORGET: send failures are logged and swallowed so they can never
 * break a webhook handler or request.
 *
 * Configuration:
 *   SMTP_HOST            - default smtp-relay.brevo.com
 *   SMTP_PORT            - default 587 (STARTTLS); 465 uses implicit TLS
 *   SMTP_USER            - Brevo SMTP login (e.g. xxxxx@smtp-brevo.com)
 *   SMTP_PASS            - the SMTP key (xsmtpsib-...). Falls back to
 *                          BREVO_API_KEY for back-compat with the old env.
 *   EMAIL_FROM_ADDRESS   - sender, default receipts@getezpm.com (domain must be
 *                          authenticated in Brevo)
 *   EMAIL_FROM_NAME      - sender display name, default "EZPM"
 *   EMAIL_REPLY_TO       - reply-to, default hello@getezpm.com
 *
 * If SMTP_USER/SMTP_PASS are unset, all sends are silent no-ops (no errors).
 *
 * Templates share ONE brand shell — emailLayout() — so every email stays on
 * palette. Add a new email by writing its inner content and calling it.
 */

import nodemailer, { type Transporter } from 'nodemailer'

const SMTP_HOST = process.env.SMTP_HOST || 'smtp-relay.brevo.com'
const SMTP_PORT = parseInt(process.env.SMTP_PORT || '587', 10)
const SMTP_USER = process.env.SMTP_USER
const SMTP_PASS = process.env.SMTP_PASS || process.env.BREVO_API_KEY
const FROM_ADDRESS = process.env.EMAIL_FROM_ADDRESS || 'receipts@getezpm.com'
const FROM_NAME = process.env.EMAIL_FROM_NAME || 'EZPM'
const REPLY_TO = process.env.EMAIL_REPLY_TO || 'hello@getezpm.com'

export interface SendEmailInput {
  to: string
  toName?: string
  subject: string
  html: string
}

let transporter: Transporter | null = null
function getTransporter(): Transporter | null {
  if (!SMTP_USER || !SMTP_PASS) return null
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_PORT === 465,
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    })
  }
  return transporter
}

/**
 * Send one transactional email. Returns true on success, false on any failure
 * (including unconfigured). Never throws.
 */
export async function sendEmail(input: SendEmailInput): Promise<boolean> {
  const t = getTransporter()
  if (!t) return false // unconfigured — silently skip
  try {
    await t.sendMail({
      from: { name: FROM_NAME, address: FROM_ADDRESS },
      to: input.toName ? `"${input.toName}" <${input.to}>` : input.to,
      replyTo: REPLY_TO,
      subject: input.subject,
      html: input.html,
    })
    return true
  } catch (err) {
    console.warn('[email] SMTP send failed (non-fatal):', err instanceof Error ? err.message : err)
    return false
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Shared brand shell — one source of truth for both emails (eng review CQ1)
// ──────────────────────────────────────────────────────────────────────────────

// Palette matches getezpm.com. Email-safe: web-safe fonts only (clients won't
// load @font-face, so Georgia stands in for Fraunces).
const C = {
  cream: '#FAF6EE',
  card: '#FFFFFF',
  ink: '#2A2520',
  ink2: '#5C534A',
  muted: '#897F73',
  teal: '#0D7377',
  leaf: '#4D8B5C',
  amber: '#B88828',
  red: '#B05446',
  border: '#E8DFC9',
}
const SERIF = "Georgia, 'Times New Roman', serif"
const SANS = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function money(n: number): string {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
}

function longDate(d: Date): string {
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
}

interface EmailLayoutInput {
  subject: string
  preheader: string
  badge?: { text: string; color: string; bg: string }
  heading: string         // already-escaped/safe HTML
  intro: string           // already-escaped/safe HTML
  bodyHtml: string        // the middle (amount block, details table, etc.)
  footerNote: string      // already-escaped/safe HTML
}

/**
 * The full branded email document. Owns the DOCTYPE, the cream canvas, the
 * "ez" seal header, the white card, the help-note, and the footer. Callers
 * supply only the inner content via `bodyHtml` (+ heading/intro/badge).
 */
function emailLayout(i: EmailLayoutInput): string {
  const badge = i.badge
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin-bottom:18px;">
         <tr><td style="background-color:${i.badge.bg};border-radius:999px;padding:6px 14px;font-family:${SANS};font-size:12px;font-weight:700;color:${i.badge.color};letter-spacing:0.02em;">${escapeHtml(i.badge.text)}</td></tr>
       </table>`
    : ''

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="color-scheme" content="light">
<title>${escapeHtml(i.subject)}</title>
</head>
<body style="margin:0;padding:0;background-color:${C.cream};">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(i.preheader)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${C.cream};">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">

          <!-- Brand header -->
          <tr>
            <td style="padding:0 4px 24px 4px;">
              <table role="presentation" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="background-color:${C.teal};border-radius:9px;width:34px;height:34px;text-align:center;vertical-align:middle;font-family:${SERIF};font-size:14px;font-weight:bold;color:${C.cream};">ez</td>
                  <td style="padding-left:10px;font-family:${SERIF};font-size:20px;font-weight:bold;color:${C.ink};">EZPM</td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Card -->
          <tr>
            <td style="background-color:${C.card};border:1px solid ${C.border};border-radius:18px;padding:36px 32px;">
              ${badge}
              <h1 style="margin:0 0 6px 0;font-family:${SERIF};font-size:30px;font-weight:normal;color:${C.ink};line-height:1.15;">${i.heading}</h1>
              <p style="margin:0 0 24px 0;font-family:${SANS};font-size:15px;color:${C.ink2};line-height:1.5;">${i.intro}</p>
              ${i.bodyHtml}
            </td>
          </tr>

          <!-- Help note -->
          <tr>
            <td style="padding:20px 8px 0 8px;">
              <p style="margin:0;font-family:${SANS};font-size:13px;color:${C.ink2};line-height:1.5;">${i.footerNote}</p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:24px 8px;border-top:1px solid ${C.border};margin-top:8px;">
              <p style="margin:0 0 4px 0;font-family:${SANS};font-size:12px;color:${C.muted};">
                EZPM &middot; <a href="https://app.getezpm.com" style="color:${C.teal};text-decoration:none;">app.getezpm.com</a>
              </p>
              <p style="margin:0;font-family:${SANS};font-size:11px;color:${C.muted};">
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
}

/** A label/value row for the details table inside an email card. */
function detailRow(label: string, valueHtml: string, mono = false): string {
  const valueFont = mono ? "'Courier New',monospace" : SANS
  const valueSize = mono ? '12px' : '14px'
  const valueColor = mono ? C.ink2 : C.ink
  const valueWeight = mono ? 'normal' : '600'
  return `
    <tr>
      <td style="padding:10px 0;border-bottom:1px solid ${C.border};font-family:${SANS};font-size:13px;color:${C.muted};">${escapeHtml(label)}</td>
      <td style="padding:10px 0;border-bottom:1px solid ${C.border};font-family:${valueFont};font-size:${valueSize};color:${valueColor};text-align:right;font-weight:${valueWeight};">${valueHtml}</td>
    </tr>`
}

// ──────────────────────────────────────────────────────────────────────────────
// Receipt email
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

export function renderReceiptEmail(data: ReceiptData): { subject: string; html: string } {
  const propertyLine = data.propertyAddress
    ? escapeHtml(data.propertyAddress) + (data.propertyUnit ? `, Unit ${escapeHtml(data.propertyUnit)}` : '')
    : 'Your residence'

  const methodLabel = data.paymentMethodType === 'us_bank_account'
    ? `Bank account ${data.paymentMethodLast4 ? '••' + escapeHtml(data.paymentMethodLast4) : '(ACH)'}`
    : data.paymentMethodType === 'card'
      ? `Card ${data.paymentMethodLast4 ? '••' + escapeHtml(data.paymentMethodLast4) : ''}`
      : 'On file'

  const subject = `Receipt — ${money(data.amount)} rent payment received`

  const bodyHtml = `
    <!-- Amount -->
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${C.cream};border-radius:14px;margin-bottom:24px;">
      <tr>
        <td style="padding:22px 24px;text-align:center;">
          <div style="font-family:${SANS};font-size:12px;font-weight:600;color:${C.muted};text-transform:uppercase;letter-spacing:0.06em;margin-bottom:6px;">Amount paid</div>
          <div style="font-family:${SERIF};font-size:44px;font-weight:normal;color:${C.teal};line-height:1;">${money(data.amount)}</div>
        </td>
      </tr>
    </table>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      ${detailRow('Date paid', longDate(data.paidDate))}
      ${detailRow('Property', propertyLine)}
      ${detailRow('Payment method', methodLabel)}
      ${detailRow('Receipt #', escapeHtml(data.invoiceId), true)}
    </table>`

  const html = emailLayout({
    subject,
    preheader: `Your ${money(data.amount)} rent payment was received. Thank you!`,
    badge: { text: '✓ PAYMENT RECEIVED', color: C.leaf, bg: '#E2EDE1' },
    heading: `Thank you, ${escapeHtml(data.tenantName)}.`,
    intro: 'We&rsquo;ve received your rent payment. Here&rsquo;s your receipt for your records.',
    bodyHtml,
    footerNote:
      'This payment was processed securely by Stripe. No action is needed — your auto-pay remains active for next month. Questions about your account? Just reply to this email.',
  })

  return { subject, html }
}

/** Fire-and-forget: render + send a receipt. */
export async function sendReceipt(data: ReceiptData): Promise<void> {
  const { subject, html } = renderReceiptEmail(data)
  await sendEmail({ to: data.tenantEmail, toName: data.tenantName, subject, html })
}

// ──────────────────────────────────────────────────────────────────────────────
// Maintenance status-change email (Phase 1)
// ──────────────────────────────────────────────────────────────────────────────

export type MaintenanceStatus = 'open' | 'in_progress' | 'resolved' | 'cancelled'

export interface MaintenanceStatusData {
  tenantName: string
  tenantEmail: string
  requestTitle: string
  status: MaintenanceStatus
  propertyAddress?: string | null
  propertyUnit?: string | null
}

const STATUS_LABEL: Record<MaintenanceStatus, string> = {
  open: 'Open',
  in_progress: 'In Progress',
  resolved: 'Resolved',
  cancelled: 'Cancelled',
}

const STATUS_BADGE: Record<MaintenanceStatus, { text: string; color: string; bg: string }> = {
  open: { text: 'OPEN', color: C.amber, bg: '#F6EDD8' },
  in_progress: { text: 'IN PROGRESS', color: C.teal, bg: '#DCEEEF' },
  resolved: { text: '✓ RESOLVED', color: C.leaf, bg: '#E2EDE1' },
  cancelled: { text: 'CANCELLED', color: C.muted, bg: '#EFEBE2' },
}

const STATUS_INTRO: Record<MaintenanceStatus, string> = {
  open: 'We&rsquo;ve logged your maintenance request. Here&rsquo;s where it stands.',
  in_progress: 'Good news — your landlord is now working on your request.',
  resolved: 'Your maintenance request has been marked resolved. If anything&rsquo;s still not right, just open a new request.',
  cancelled: 'Your maintenance request has been cancelled. Open a new one anytime if you still need help.',
}

export function renderMaintenanceStatusEmail(
  data: MaintenanceStatusData,
): { subject: string; html: string } {
  const label = STATUS_LABEL[data.status]
  const propertyLine = data.propertyAddress
    ? escapeHtml(data.propertyAddress) + (data.propertyUnit ? `, Unit ${escapeHtml(data.propertyUnit)}` : '')
    : 'Your residence'

  const subject = `Your maintenance request is now ${label}`

  const bodyHtml = `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${C.cream};border-radius:14px;margin-bottom:24px;">
      <tr>
        <td style="padding:20px 24px;">
          <div style="font-family:${SANS};font-size:12px;font-weight:600;color:${C.muted};text-transform:uppercase;letter-spacing:0.06em;margin-bottom:6px;">Request</div>
          <div style="font-family:${SERIF};font-size:22px;font-weight:normal;color:${C.ink};line-height:1.25;">${escapeHtml(data.requestTitle)}</div>
        </td>
      </tr>
    </table>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      ${detailRow('Status', `<span style="color:${C.teal};">${escapeHtml(label)}</span>`)}
      ${detailRow('Property', propertyLine)}
    </table>`

  const html = emailLayout({
    subject,
    preheader: `Your maintenance request "${data.requestTitle}" is now ${label}.`,
    badge: STATUS_BADGE[data.status],
    heading: `Hi ${escapeHtml(data.tenantName)},`,
    intro: STATUS_INTRO[data.status],
    bodyHtml,
    footerNote:
      'View the full request anytime in your tenant portal. Questions? Just reply to this email.',
  })

  return { subject, html }
}

/** Fire-and-forget: render + send a maintenance status-change email. */
export async function sendMaintenanceStatusEmail(data: MaintenanceStatusData): Promise<void> {
  const { subject, html } = renderMaintenanceStatusEmail(data)
  await sendEmail({ to: data.tenantEmail, toName: data.tenantName, subject, html })
}

// ──────────────────────────────────────────────────────────────────────────────
// Maintenance reply email (admin replied in the request thread)
// ──────────────────────────────────────────────────────────────────────────────

export interface MaintenanceReplyData {
  tenantName: string
  tenantEmail: string
  requestTitle: string
  replyBody: string
  requestUrl: string
}

export function renderMaintenanceReplyEmail(data: MaintenanceReplyData): { subject: string; html: string } {
  const subject = `New reply on your request: ${data.requestTitle}`
  const isPhotoOnly = !data.replyBody || data.replyBody.trim() === '' || data.replyBody.trim() === '(photo)'
  const replyHtml = isPhotoOnly
    ? '📷 Shared a photo — open the request to view it.'
    : escapeHtml(data.replyBody).replace(/\n/g, '<br>')

  const bodyHtml = `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px;">
      <tr>
        <td style="padding:14px 18px;background-color:${C.cream};border-radius:12px;">
          <div style="font-family:${SANS};font-size:12px;font-weight:600;color:${C.muted};text-transform:uppercase;letter-spacing:0.06em;margin-bottom:6px;">Your request</div>
          <div style="font-family:${SERIF};font-size:20px;font-weight:normal;color:${C.ink};line-height:1.25;">${escapeHtml(data.requestTitle)}</div>
        </td>
      </tr>
    </table>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
      <tr>
        <td style="padding:16px 18px;background-color:#FFFFFF;border:1px solid ${C.border};border-left:3px solid ${C.teal};border-radius:10px;">
          <div style="font-family:${SANS};font-size:12px;font-weight:600;color:${C.muted};text-transform:uppercase;letter-spacing:0.06em;margin-bottom:8px;">Property manager replied</div>
          <div style="font-family:${SANS};font-size:15px;color:${C.ink};line-height:1.55;">${replyHtml}</div>
        </td>
      </tr>
    </table>
    <table role="presentation" cellpadding="0" cellspacing="0">
      <tr>
        <td style="background-color:${C.teal};border-radius:10px;">
          <a href="${data.requestUrl}" style="display:inline-block;padding:12px 22px;font-family:${SANS};font-size:14px;font-weight:600;color:#FFFFFF;text-decoration:none;">View &amp; reply &rarr;</a>
        </td>
      </tr>
    </table>`

  const html = emailLayout({
    subject,
    preheader: `Your property manager replied to "${data.requestTitle}".`,
    badge: { text: '💬 NEW REPLY', color: C.teal, bg: '#DCEEEF' },
    heading: `Hi ${escapeHtml(data.tenantName)},`,
    intro: 'Your property manager replied to your maintenance request.',
    bodyHtml,
    footerNote: 'Reply right from the request page in your tenant portal, or just reply to this email.',
  })

  return { subject, html }
}

/** Fire-and-forget: render + send a maintenance reply email. */
export async function sendMaintenanceReplyEmail(data: MaintenanceReplyData): Promise<void> {
  const { subject, html } = renderMaintenanceReplyEmail(data)
  await sendEmail({ to: data.tenantEmail, toName: data.tenantName, subject, html })
}

// ──────────────────────────────────────────────────────────────────────────────
// Announcement email (admin → tenants broadcast)
// ──────────────────────────────────────────────────────────────────────────────

export interface AnnouncementEmailData {
  title: string
  body: string
}

export function renderAnnouncementEmail(data: AnnouncementEmailData): { subject: string; html: string } {
  const subject = data.title
  // Preserve the admin's line breaks; escape everything else.
  const bodyParagraphs = escapeHtml(data.body)
    .split(/\n{2,}/)
    .map(
      (p) =>
        `<p style="margin:0 0 14px 0;font-family:${SANS};font-size:15px;color:${C.ink2};line-height:1.6;">${p.replace(/\n/g, '<br>')}</p>`,
    )
    .join('')

  const bodyHtml = `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${C.cream};border-radius:14px;">
      <tr><td style="padding:22px 24px;">${bodyParagraphs}</td></tr>
    </table>`

  const html = emailLayout({
    subject,
    preheader: data.title,
    badge: { text: '📣 ANNOUNCEMENT', color: C.teal, bg: '#DCEEEF' },
    heading: escapeHtml(data.title),
    intro: 'A message from your property manager.',
    bodyHtml,
    footerNote: 'You can also see this in your tenant portal. Questions? Just reply to this email.',
  })

  return { subject, html }
}
