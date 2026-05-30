/**
 * POST /api/tenant/payment-methods/details — retrieve display fields for a
 * freshly-created Stripe PaymentMethod (type, last4, brand, bank name).
 *
 * Two ownership-check paths:
 *   (preferred) setupIntentId — validates the SetupIntent's customer matches
 *               the tenant's stripe_customer_id. Required for
 *               us_bank_account/microdeposit flows because the PaymentMethod
 *               is NOT attached to the customer until verification completes
 *               (so PM.customer is null at SetupIntent.requires_action time).
 *
 *   (legacy)   paymentMethodId only — falls back to checking PM.customer
 *               directly. Works for instant-verified PMs (cards, ACH via
 *               Financial Connections) where attach happens immediately.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { createServerSupabaseClient } from '@/lib/supabase'
import { stripe } from '@/lib/stripe-server'
import type Stripe from 'stripe'

export async function POST(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session || session.role !== 'tenant') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { paymentMethodId, setupIntentId } = await request.json()
    if (!paymentMethodId && !setupIntentId) {
      return NextResponse.json(
        { error: 'paymentMethodId or setupIntentId required' },
        { status: 400 },
      )
    }

    const supabase = createServerSupabaseClient()
    const { data: tenant } = await supabase
      .from('tenants')
      .select('stripe_customer_id')
      .eq('user_id', session.userId)
      .maybeSingle()
    if (!tenant?.stripe_customer_id) {
      return NextResponse.json({ error: 'Tenant has no Stripe Customer' }, { status: 400 })
    }

    let pm: Stripe.PaymentMethod

    if (setupIntentId) {
      // SetupIntent-based path: works for both attached and not-yet-attached PMs.
      // The SetupIntent's customer field is always set (we created the intent with it).
      const si = await stripe.setupIntents.retrieve(setupIntentId, { expand: ['payment_method'] })
      const siCustomer = typeof si.customer === 'string' ? si.customer : si.customer?.id
      if (siCustomer !== tenant.stripe_customer_id) {
        return NextResponse.json(
          { error: 'SetupIntent does not belong to your customer' },
          { status: 403 },
        )
      }
      if (!si.payment_method || typeof si.payment_method === 'string') {
        return NextResponse.json(
          { error: 'SetupIntent has no expanded payment method' },
          { status: 500 },
        )
      }
      pm = si.payment_method
    } else {
      // Legacy direct-PM path: only safe for already-attached PMs.
      pm = await stripe.paymentMethods.retrieve(paymentMethodId)
      const attachedCustomerId = typeof pm.customer === 'string' ? pm.customer : pm.customer?.id
      if (attachedCustomerId !== tenant.stripe_customer_id) {
        return NextResponse.json(
          { error: 'PaymentMethod is not attached to your Stripe Customer' },
          { status: 403 },
        )
      }
    }

    return NextResponse.json({
      type: pm.type,
      last4: pm.card?.last4 ?? pm.us_bank_account?.last4 ?? null,
      brand: pm.card?.brand ?? null,
      bankName: pm.us_bank_account?.bank_name ?? null,
    })
  } catch (error) {
    console.error('PaymentMethod details error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 },
    )
  }
}
