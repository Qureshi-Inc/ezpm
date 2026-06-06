/**
 * Stripe event -> local DB mutation logic.
 *
 * Extracted from app/api/webhooks/stripe/route.ts so both the live webhook
 * handler AND scripts/reconcile-stripe.ts can call into the same code. The
 * idempotency layer (stripe_events insert with ON CONFLICT) is the caller's
 * responsibility — this module assumes the event has been claimed exactly
 * once already.
 */

import type Stripe from 'stripe'
import type { createServerSupabaseClient } from './supabase'
import { notify } from './notify'
import { sendPaymentChargedEmail } from './email'

type Supabase = ReturnType<typeof createServerSupabaseClient>

export async function handleStripeEvent(event: Stripe.Event, supabase: Supabase): Promise<void> {
  switch (event.type) {
    case 'invoice.created':
    case 'invoice.finalized':
      await mirrorInvoice(event.data.object as Stripe.Invoice, supabase)
      break

    case 'invoice.payment_succeeded': {
      const invoice = event.data.object as Stripe.Invoice
      // Read the prior mirror status BEFORE upserting so we can tell an
      // instant (card) payment from a bank/ACH one that already announced
      // itself at `payment_intent.processing`. Only instant payments get the
      // charged email here; ACH already emailed at processing-start (we send
      // exactly one payment email per charge).
      const priorStatus = await currentPaymentStatus(invoice.id, supabase)
      await mirrorInvoice(invoice, supabase, {
        status: 'succeeded',
        paid_at: new Date(
          (invoice.status_transitions?.paid_at ?? invoice.created) * 1000,
        ).toISOString(),
      })
      // Look up tenant info for the Mattermost notification. This is a
      // separate query so mirrorInvoice stays unchanged and independent.
      void notifyRentCharged(invoice, supabase)
      if (priorStatus !== 'processing' && priorStatus !== 'succeeded') {
        // Instant payment (card) — email the branded receipt. Fire-and-forget:
        // a Brevo outage or missing key can never break webhook processing.
        void sendChargedEmail(
          {
            customerId: customerIdOf(invoice.customer),
            amount: invoice.amount_paid / 100,
            invoiceId: invoice.id ?? '',
            chargedDate: new Date(
              (invoice.status_transitions?.paid_at ?? invoice.created) * 1000,
            ),
            paymentMethodStripeId:
              typeof invoice.default_payment_method === 'string'
                ? invoice.default_payment_method
                : null,
            isProcessing: false,
          },
          supabase,
        )
      }
      break
    }

    case 'payment_intent.processing': {
      // Bank/ACH payment submitted but not yet cleared. The invoice stays
      // `open` on Stripe's side the whole time it clears, so without this the
      // tenant would keep seeing "Pay Now". Mark the mirror `processing` and
      // send the single "on its way" email (with the clearing ETA).
      await handlePaymentProcessing(event.data.object as Stripe.PaymentIntent, supabase)
      break
    }

    case 'invoice.payment_failed': {
      const invoice = event.data.object as Stripe.Invoice
      await mirrorInvoice(invoice, supabase, { status: 'failed' })
      void notifyRentFailed(invoice, supabase, 'payment_failed')
      break
    }

    case 'invoice.marked_uncollectible': {
      const invoice = event.data.object as Stripe.Invoice
      await mirrorInvoice(invoice, supabase, { status: 'uncollectible' })
      void notifyRentFailed(invoice, supabase, 'uncollectible')
      break
    }

    case 'invoice.voided':
      await mirrorInvoice(event.data.object as Stripe.Invoice, supabase, { status: 'void' })
      break

    case 'customer.subscription.created': {
      const sub = event.data.object as Stripe.Subscription
      const tenantId = sub.metadata?.tenant_id
      if (!tenantId) {
        console.warn(`Subscription ${sub.id} has no tenant_id metadata — skipping`)
        break
      }
      await supabase
        .from('tenants')
        .update({ stripe_subscription_id: sub.id })
        .eq('id', tenantId)
      break
    }

    case 'customer.subscription.deleted': {
      const sub = event.data.object as Stripe.Subscription
      await supabase
        .from('tenants')
        .update({ stripe_subscription_id: null })
        .eq('stripe_subscription_id', sub.id)
      break
    }

    case 'customer.subscription.updated':
      // No-op for now. Rent-amount changes are driven from our admin UI
      // (which calls updateSubscriptionPrice directly).
      break

    default:
      console.log(`Unhandled Stripe event type: ${event.type}`)
  }
}

async function mirrorInvoice(
  invoice: Stripe.Invoice,
  supabase: Supabase,
  override?: { status?: string; paid_at?: string },
): Promise<void> {
  const tenantId =
    invoice.metadata?.tenant_id ??
    (await tenantIdFromCustomer(invoice.customer, supabase))
  if (!tenantId) {
    console.warn(`Invoice ${invoice.id} could not be linked to a tenant — skipping`)
    return
  }

  const { data: tenant } = await supabase
    .from('tenants')
    .select('property_id')
    .eq('id', tenantId)
    .maybeSingle()

  const status = override?.status ?? mapInvoiceStatus(invoice.status)
  const dueDate = invoice.due_date
    ? new Date(invoice.due_date * 1000).toISOString().slice(0, 10)
    : new Date(invoice.created * 1000).toISOString().slice(0, 10)

  // Stripe Invoice exposes default_payment_method directly; payment_settings
  // also has a payment_method_types[] but the resolved PM ID lives at the
  // top level.
  let paymentMethodId: string | null = null
  const stripePm = invoice.default_payment_method
  if (typeof stripePm === 'string' && stripePm) {
    const { data: pm } = await supabase
      .from('payment_methods')
      .select('id')
      .eq('stripe_payment_method_id', stripePm)
      .maybeSingle()
    if (pm) paymentMethodId = pm.id
  }

  // Stripe API 2026-05-27.dahlia removed invoice.charge and invoice.payment_intent
  // at the top level. The new shape is invoice.payments[] (an ApiList<InvoicePayment>),
  // where each entry maps the invoice to a PaymentIntent (or charge). Best-effort
  // pull the PaymentIntent id so the row carries it (powers the payment-history
  // ID display and lets payment_intent.* events match by id). The processing
  // handler also stamps it, so this is belt-and-suspenders; never fatal if absent.
  // TODO (T12): also surface the charge id to support charge.failed / disputes.
  const stripePaymentIntentId: string | null = paymentIntentIdFromInvoice(invoice)

  const row: Record<string, unknown> = {
    stripe_invoice_id: invoice.id,
    tenant_id: tenantId,
    property_id: tenant?.property_id ?? null,
    amount: invoice.amount_due / 100,
    status,
    payment_method_id: paymentMethodId,
    due_date: dueDate,
    paid_at: override?.paid_at ?? null,
  }
  // Only write the PaymentIntent id when we actually have one, so a later
  // event (or a draft mirror) can't clobber an id stamped by the processing
  // handler with null.
  if (stripePaymentIntentId) row.stripe_payment_intent_id = stripePaymentIntentId

  await supabase.from('payments').upsert(row, { onConflict: 'stripe_invoice_id' })
}

async function tenantIdFromCustomer(
  customer: string | Stripe.Customer | Stripe.DeletedCustomer | null,
  supabase: Supabase,
): Promise<string | null> {
  if (!customer) return null
  const customerId = typeof customer === 'string' ? customer : customer.id
  const { data } = await supabase
    .from('tenants')
    .select('id')
    .eq('stripe_customer_id', customerId)
    .maybeSingle()
  return data?.id ?? null
}

/**
 * Shared tenant lookup for notification helpers.
 */
async function tenantForInvoice(
  invoice: Stripe.Invoice,
  supabase: Supabase,
): Promise<{ email: string; first_name: string | null; last_name: string | null } | null> {
  const customerId = typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id
  if (!customerId) return null
  const { data } = await supabase
    .from('tenants')
    .select('email, first_name, last_name')
    .eq('stripe_customer_id', customerId)
    .maybeSingle()
  return data ?? null
}

/**
 * Fire-and-forget: looks up the tenant from the invoice's customer and sends
 * a Mattermost notification. Errors are silently swallowed so they can never
 * affect the webhook response or the mirrorInvoice result.
 */
async function notifyRentCharged(invoice: Stripe.Invoice, supabase: Supabase): Promise<void> {
  try {
    const tenant = await tenantForInvoice(invoice, supabase)
    if (!tenant) return
    notify.rentCharged({
      email: tenant.email,
      firstName: tenant.first_name,
      lastName: tenant.last_name,
      amount: invoice.amount_paid / 100,
      invoiceId: invoice.id,
    })
  } catch {
    // Never let a notification failure bubble up to the webhook handler.
  }
}

async function notifyRentFailed(
  invoice: Stripe.Invoice,
  supabase: Supabase,
  reason: 'payment_failed' | 'uncollectible',
): Promise<void> {
  try {
    const tenant = await tenantForInvoice(invoice, supabase)
    if (!tenant) return
    notify.rentFailed({
      email: tenant.email,
      firstName: tenant.first_name,
      lastName: tenant.last_name,
      amount: invoice.amount_due / 100,
      invoiceId: invoice.id,
      reason,
    })
  } catch {
    // Never let a notification failure bubble up to the webhook handler.
  }
}

interface ChargedEmailInput {
  customerId: string | null
  amount: number              // dollars
  invoiceId: string
  chargedDate: Date
  paymentMethodStripeId: string | null
  isProcessing: boolean       // true = bank/ACH still clearing
}

/**
 * Fire-and-forget: send the tenant the single "payment charged" email. For a
 * card (instant) payment this reads like a receipt; for bank/ACH (isProcessing)
 * it reads as "on its way" and quotes the clearing ETA. Looks up the full
 * context (name, property, payment method) and respects the tenant's
 * `notify_payment_charged` preference. Any failure is swallowed.
 */
async function sendChargedEmail(input: ChargedEmailInput, supabase: Supabase): Promise<void> {
  try {
    if (!input.customerId) return

    const { data: tenant } = await supabase
      .from('tenants')
      .select('email, first_name, last_name, property_id, notify_payment_charged')
      .eq('stripe_customer_id', input.customerId)
      .maybeSingle()
    if (!tenant?.email) return
    // Respect the tenant's payment-email preference (default on).
    if (tenant.notify_payment_charged === false) return

    // Property (optional — email still sends without it).
    let propertyAddress: string | null = null
    let propertyUnit: string | null = null
    if (tenant.property_id) {
      const { data: property } = await supabase
        .from('properties')
        .select('address, unit_number')
        .eq('id', tenant.property_id)
        .maybeSingle()
      propertyAddress = property?.address ?? null
      propertyUnit = property?.unit_number ?? null
    }

    // Payment method (optional) — resolve via the Stripe PM id.
    let methodType: string | null = null
    let methodLast4: string | null = null
    if (input.paymentMethodStripeId) {
      const { data: pm } = await supabase
        .from('payment_methods')
        .select('type, last4')
        .eq('stripe_payment_method_id', input.paymentMethodStripeId)
        .maybeSingle()
      methodType = pm?.type ?? null
      methodLast4 = pm?.last4 ?? null
    }

    const fullName = [tenant.first_name, tenant.last_name].filter(Boolean).join(' ') || tenant.email

    await sendPaymentChargedEmail({
      tenantName: fullName,
      tenantEmail: tenant.email,
      amount: input.amount,
      invoiceId: input.invoiceId,
      chargedDate: input.chargedDate,
      isProcessing: input.isProcessing,
      propertyAddress,
      propertyUnit,
      paymentMethodType: methodType,
      paymentMethodLast4: methodLast4,
    })
  } catch {
    // Never let an email failure bubble up to the webhook handler.
  }
}

/**
 * Handle a bank/ACH payment entering Stripe's `processing` state. Marks the
 * matching `payments` mirror row `processing` and sends the single "on its way"
 * email. The invoice stays `open` on Stripe's side until funds clear, so this
 * is what stops the tenant dashboard from nagging "Pay Now" while in flight.
 *
 * Linking: cards never enter `processing`, so a tenant in this path has exactly
 * one open invoice. We match the tenant's open mirror row by amount; the
 * `status = 'open'` guard also makes a replay (reconcile) a safe no-op (an
 * already-`processing`/`succeeded` row won't match, so no duplicate email).
 */
async function handlePaymentProcessing(
  pi: Stripe.PaymentIntent,
  supabase: Supabase,
): Promise<void> {
  const tenantId = await tenantIdFromCustomer(pi.customer, supabase)
  if (!tenantId) {
    console.warn(`PaymentIntent ${pi.id} processing — no tenant for customer; skipping`)
    return
  }

  const amount = pi.amount / 100
  const { data: rows } = await supabase
    .from('payments')
    .select('id, stripe_invoice_id, amount')
    .eq('tenant_id', tenantId)
    .eq('status', 'open')
    .order('due_date', { ascending: false })

  // Prefer the amount-matched open invoice; fall back to the most recent open
  // one if Stripe's amount and our mirror disagree (e.g. proration rounding).
  const match =
    rows?.find((r) => Number(r.amount) === amount) ?? rows?.[0] ?? null
  if (!match) {
    console.warn(`PaymentIntent ${pi.id} processing — no open invoice for tenant ${tenantId}; skipping`)
    return
  }

  await supabase
    .from('payments')
    .update({ status: 'processing', stripe_payment_intent_id: pi.id })
    .eq('id', match.id)

  void sendChargedEmail(
    {
      customerId: customerIdOf(pi.customer),
      amount,
      invoiceId: match.stripe_invoice_id ?? '',
      chargedDate: new Date(pi.created * 1000),
      paymentMethodStripeId:
        typeof pi.payment_method === 'string'
          ? pi.payment_method
          : pi.payment_method?.id ?? null,
      isProcessing: true,
    },
    supabase,
  )
}

/** Current mirror status for an invoice, or null if not yet mirrored. */
async function currentPaymentStatus(
  invoiceId: string | undefined,
  supabase: Supabase,
): Promise<string | null> {
  if (!invoiceId) return null
  const { data } = await supabase
    .from('payments')
    .select('status')
    .eq('stripe_invoice_id', invoiceId)
    .maybeSingle()
  return data?.status ?? null
}

/** Narrow a Stripe customer field (string | object | null) to its id. */
function customerIdOf(
  customer: string | Stripe.Customer | Stripe.DeletedCustomer | null,
): string | null {
  if (!customer) return null
  return typeof customer === 'string' ? customer : customer.id
}

/**
 * Best-effort: pull the PaymentIntent id from an invoice's `payments[]` mapping
 * (Stripe dahlia API). Returns null if the list isn't present/expanded on the
 * event payload — callers must treat the id as optional.
 */
function paymentIntentIdFromInvoice(invoice: Stripe.Invoice): string | null {
  // invoice.payments is ApiList<InvoicePayment>; each entry's `payment` maps to
  // a PaymentIntent (string id or expanded object) when type === 'payment_intent'.
  // The list is optional/expandable, so guard for it being absent on the event.
  for (const entry of invoice.payments?.data ?? []) {
    if (entry.payment?.type === 'payment_intent') {
      const pi = entry.payment.payment_intent
      if (typeof pi === 'string') return pi
      if (pi && typeof pi === 'object') return pi.id
    }
  }
  return null
}

function mapInvoiceStatus(stripeStatus: Stripe.Invoice.Status | null): string {
  switch (stripeStatus) {
    case 'open':
      return 'open'
    case 'paid':
      return 'succeeded'
    case 'uncollectible':
      return 'uncollectible'
    case 'void':
      return 'void'
    case 'draft':
      return 'open'
    default:
      return 'open'
  }
}
