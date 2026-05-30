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

type Supabase = ReturnType<typeof createServerSupabaseClient>

export async function handleStripeEvent(event: Stripe.Event, supabase: Supabase): Promise<void> {
  switch (event.type) {
    case 'invoice.created':
    case 'invoice.finalized':
      await mirrorInvoice(event.data.object as Stripe.Invoice, supabase)
      break

    case 'invoice.payment_succeeded': {
      const invoice = event.data.object as Stripe.Invoice
      await mirrorInvoice(invoice, supabase, {
        status: 'succeeded',
        paid_at: new Date(
          (invoice.status_transitions?.paid_at ?? invoice.created) * 1000,
        ).toISOString(),
      })
      break
    }

    case 'invoice.payment_failed':
      await mirrorInvoice(event.data.object as Stripe.Invoice, supabase, { status: 'failed' })
      break

    case 'invoice.marked_uncollectible':
      await mirrorInvoice(event.data.object as Stripe.Invoice, supabase, { status: 'uncollectible' })
      break

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
  // at the top level. The new shape is invoice.payments[] (an ApiList<InvoicePayment>).
  // For the T12 ACH-return follow-up we'll want to walk this list to find the
  // most recent PaymentIntent + Charge. For now (this PR), we leave both columns
  // null and look up via stripe_invoice_id when needed.
  // TODO (T12): populate stripeChargeId from invoice.payments to support
  // charge.failed / charge.dispute.created webhook handling.
  const stripeChargeId: string | null = null
  const stripePaymentIntentId: string | null = null

  await supabase.from('payments').upsert(
    {
      stripe_invoice_id: invoice.id,
      tenant_id: tenantId,
      property_id: tenant?.property_id ?? null,
      amount: invoice.amount_due / 100,
      status,
      stripe_payment_intent_id: stripePaymentIntentId,
      stripe_charge_id: stripeChargeId,
      payment_method_id: paymentMethodId,
      due_date: dueDate,
      paid_at: override?.paid_at ?? null,
    },
    { onConflict: 'stripe_invoice_id' },
  )
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
