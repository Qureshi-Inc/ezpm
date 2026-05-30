/**
 * Stripe Subscriptions helpers for ezpm.
 *
 * Rent collection model: one Stripe Customer per tenant; one Stripe
 * Subscription per tenant (with the rent_amount as a Price, monthly cycle,
 * billing_cycle_anchor set to the tenant's payment_due_day). Stripe runs the
 * schedule. Our server only needs to be alive to receive webhooks; outage
 * recovery comes via scripts/reconcile-stripe.ts.
 *
 * Why a separate Price per tenant rather than a shared Price across all
 * tenants: rents vary per property and can change mid-lease. Generating a
 * one-tenant-one-Price-one-Subscription tree means rent updates are a
 * single subscription update (deactivate old Price, attach new Price).
 *
 * Currency: USD only for now.
 */

import { stripe } from './stripe-server'
import { createServerSupabaseClient } from './supabase'
import type Stripe from 'stripe'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

/**
 * Lazy-create (and cache) the shared "Monthly rent" Stripe Product.
 *
 * Stripe API dahlia (2026-05) requires price_data.product to reference a
 * pre-created Product ID — the old inline `product_data: { name }` was
 * removed. We use ONE product for all rent across the platform; each
 * tenant gets their own Price under this product (with their rent_amount
 * as unit_amount).
 *
 * The product ID is cached in system_settings (key 'stripe_rent_product_id')
 * so we only create it once.
 */
async function ensureRentProduct(): Promise<string> {
  const supabase = createServerSupabaseClient()
  const { data: existing } = await supabase
    .from('system_settings')
    .select('value')
    .eq('key', 'stripe_rent_product_id')
    .maybeSingle()
  if (existing?.value && typeof existing.value === 'string') {
    return existing.value
  }

  const product = await stripe.products.create({
    name: 'Monthly rent',
    description: 'Recurring monthly rent payment via EZPM',
    metadata: { app: 'ezpm' },
  })

  await supabase
    .from('system_settings')
    .upsert(
      { key: 'stripe_rent_product_id', value: product.id },
      { onConflict: 'key' },
    )

  return product.id
}

export interface TenantBillingContext {
  tenantId: string
  email: string
  firstName: string
  lastName: string
  rentAmount: number
  paymentDueDay: number
}

/**
 * Ensure a Stripe Customer exists for this tenant. Idempotent — returns the
 * existing customer_id if already set, otherwise creates one and persists it.
 *
 * Called from /api/tenant/payment-methods POST (when tenant adds their first
 * card or bank account) and from admin tenant onboarding flows.
 */
export async function ensureStripeCustomer(
  tenantId: string,
): Promise<string> {
  const supabase = createServerSupabaseClient()

  const { data: tenant, error } = await supabase
    .from('tenants')
    .select('id, email, first_name, last_name, phone, stripe_customer_id')
    .eq('id', tenantId)
    .single()

  if (error || !tenant) {
    throw new Error(`Tenant ${tenantId} not found: ${error?.message}`)
  }

  if (tenant.stripe_customer_id) {
    return tenant.stripe_customer_id
  }

  const customer = await stripe.customers.create({
    email: tenant.email,
    name: `${tenant.first_name} ${tenant.last_name}`,
    phone: tenant.phone ?? undefined,
    metadata: { tenant_id: tenant.id },
  })

  const { error: updateError } = await supabase
    .from('tenants')
    .update({ stripe_customer_id: customer.id })
    .eq('id', tenantId)
  if (updateError) {
    // Roll back the Stripe-side Customer so we don't leak an orphan that
    // we can't reach later. Stripe customer delete is soft (returns the
    // deleted flag) so it's recoverable if we ever need it.
    await stripe.customers.del(customer.id).catch(() => {})
    throw new Error(`Failed to persist stripe_customer_id: ${updateError.message}`)
  }

  return customer.id
}

/**
 * Create the Subscription for a tenant against their assigned property's
 * rent_amount. Requires: stripe_customer_id already set, a default
 * payment method attached, and a property assigned.
 *
 * Pricing model: one inline Price per Subscription (price_data), monthly
 * recurring, anchored to the tenant's payment_due_day. Setting
 * billing_cycle_anchor to a specific date+time is the Stripe-native way to
 * make rent due on (e.g.) the 1st of every month regardless of when the
 * subscription was created.
 *
 * Proration on creation is disabled (proration_behavior: 'none') so the
 * tenant's first invoice is a full month's rent on the anchor date, not a
 * prorated partial month.
 */
export async function createSubscriptionForTenant(
  ctx: TenantBillingContext,
  defaultPaymentMethodId: string,
): Promise<Stripe.Subscription> {
  const supabase = createServerSupabaseClient()

  const { data: existing } = await supabase
    .from('tenants')
    .select('stripe_customer_id, stripe_subscription_id')
    .eq('id', ctx.tenantId)
    .single()

  if (!existing?.stripe_customer_id) {
    throw new Error(`Tenant ${ctx.tenantId} has no Stripe Customer — call ensureStripeCustomer first.`)
  }
  if (existing.stripe_subscription_id) {
    // Already subscribed. Caller should use updateSubscriptionPrice if they
    // want to change the amount, or cancelSubscription before re-subscribing.
    const sub = await stripe.subscriptions.retrieve(existing.stripe_subscription_id)
    return sub
  }

  const anchor = nextBillingAnchor(ctx.paymentDueDay)
  const productId = await ensureRentProduct()

  const sub = await stripe.subscriptions.create({
    customer: existing.stripe_customer_id,
    items: [
      {
        price_data: {
          currency: 'usd',
          product: productId,
          recurring: { interval: 'month' },
          unit_amount: Math.round(ctx.rentAmount * 100),
        },
      },
    ],
    default_payment_method: defaultPaymentMethodId,
    billing_cycle_anchor: Math.floor(anchor.getTime() / 1000),
    proration_behavior: 'none',
    collection_method: 'charge_automatically',
    payment_settings: {
      payment_method_types: ['card', 'us_bank_account'],
      save_default_payment_method: 'on_subscription',
    },
    metadata: {
      tenant_id: ctx.tenantId,
      payment_due_day: ctx.paymentDueDay.toString(),
    },
  })

  const { error: updateError } = await supabase
    .from('tenants')
    .update({ stripe_subscription_id: sub.id })
    .eq('id', ctx.tenantId)
  if (updateError) {
    // Best-effort: cancel the subscription so the customer isn't billed
    // for a subscription we lost track of.
    await stripe.subscriptions.cancel(sub.id).catch(() => {})
    throw new Error(`Failed to persist stripe_subscription_id: ${updateError.message}`)
  }

  return sub
}

/**
 * Update the rent amount on an existing Subscription. Stripe requires
 * adding a new Price + removing the old one, all in a single
 * subscription update so the next invoice picks up the new amount.
 *
 * Proration off by default — the new amount takes effect at the next
 * billing cycle. Pass prorate=true to bill the delta immediately.
 */
export async function updateSubscriptionPrice(
  subscriptionId: string,
  newRentAmount: number,
  opts: { prorate?: boolean } = {},
): Promise<Stripe.Subscription> {
  const sub = await stripe.subscriptions.retrieve(subscriptionId)
  const oldItem = sub.items.data[0]
  if (!oldItem) {
    throw new Error(`Subscription ${subscriptionId} has no items`)
  }
  const productId = await ensureRentProduct()

  return stripe.subscriptions.update(subscriptionId, {
    items: [
      {
        id: oldItem.id,
        price_data: {
          currency: 'usd',
          product: productId,
          recurring: { interval: 'month' },
          unit_amount: Math.round(newRentAmount * 100),
        },
      },
    ],
    proration_behavior: opts.prorate ? 'create_prorations' : 'none',
  })
}

/**
 * Cancel a subscription. Use this when a tenant moves out.
 * cancel_at_period_end keeps the current month's invoice payable; pass
 * { immediate: true } to cancel right now (refund logic is separate).
 */
export async function cancelSubscription(
  subscriptionId: string,
  opts: { immediate?: boolean } = {},
): Promise<Stripe.Subscription> {
  if (opts.immediate) {
    return stripe.subscriptions.cancel(subscriptionId)
  }
  return stripe.subscriptions.update(subscriptionId, {
    cancel_at_period_end: true,
  })
}

/**
 * Pay a specific invoice with a specific payment method. Used by the
 * "Pay Now" button to settle the current open invoice (e.g. after a
 * previous auto-charge failed and was retried).
 */
export async function payInvoice(
  invoiceId: string,
  paymentMethodId: string,
): Promise<Stripe.Invoice> {
  return stripe.invoices.pay(invoiceId, {
    payment_method: paymentMethodId,
  })
}

/**
 * Compute the next billing anchor date in epoch seconds.
 *
 * Stripe expects a Unix timestamp (in seconds) for billing_cycle_anchor.
 * We pick the next occurrence of payment_due_day at midnight UTC. If today
 * IS the due day, we anchor to today (Stripe will fire the first invoice
 * immediately, which is what we want for new tenants signing up on the 1st).
 */
function nextBillingAnchor(dayOfMonth: number): Date {
  const now = new Date()
  const current = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), dayOfMonth, 0, 0, 0))

  if (current.getTime() >= now.getTime()) {
    return current
  }
  // Past for this month; anchor to next month
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, dayOfMonth, 0, 0, 0))
}

export function appCallbackUrl(path: string): string {
  return new URL(path, APP_URL).toString()
}
