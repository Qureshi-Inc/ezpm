/**
 * POST /api/tenant/payment-methods/setup-intent — create a SetupIntent so
 * the client-side PaymentElement can save a new payment method without
 * charging the customer.
 *
 * Creates the tenant's Stripe Customer if one doesn't exist yet (idempotent
 * via ensureStripeCustomer).
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { createServerSupabaseClient } from '@/lib/supabase'
import { stripe } from '@/lib/stripe-server'
import { ensureStripeCustomer } from '@/lib/stripe-subscriptions'

export async function POST(_request: NextRequest) {
  try {
    const session = await getSession()
    if (!session || session.role !== 'tenant') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = createServerSupabaseClient()
    const { data: tenant, error: tenantError } = await supabase
      .from('tenants')
      .select('id')
      .eq('user_id', session.userId)
      .maybeSingle()
    if (tenantError || !tenant) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })
    }

    const stripeCustomerId = await ensureStripeCustomer(tenant.id)

    const setupIntent = await stripe.setupIntents.create({
      customer: stripeCustomerId,
      payment_method_types: ['card', 'us_bank_account'],
      // 'off_session' so we can charge the saved PM later via the Subscription
      usage: 'off_session',
      // Required for us_bank_account: collect mandate up front.
      payment_method_options: {
        us_bank_account: {
          // 'automatic' lets Stripe pick instant verification (Financial
          // Connections) when available, falling back to micro-deposits.
          verification_method: 'automatic',
          financial_connections: {
            permissions: ['payment_method'],
          },
        },
      },
    })

    return NextResponse.json({
      clientSecret: setupIntent.client_secret,
      stripeCustomerId,
    })
  } catch (error) {
    console.error('SetupIntent error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 },
    )
  }
}
