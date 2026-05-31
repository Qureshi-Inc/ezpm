/**
 * POST /api/tenant/payment-methods — tenant attaches a Stripe PaymentMethod
 * (created client-side via Stripe Elements or Financial Connections) to
 * their Stripe Customer + persists a local mirror row.
 *
 * Verification states:
 *   - 'verified' (default): card OR us_bank_account via Financial Connections.
 *     Set as default if it's the first PM; subscription auto-created if first
 *     verified PM and tenant has a property assigned.
 *   - 'pending_microdeposits': us_bank_account via manual routing+account entry.
 *     The PM is attached to the customer but cannot be charged until the tenant
 *     enters the two microdeposit amounts (see /verify-microdeposits route).
 *     Never set as default and never used to create a subscription until verified.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { createServerSupabaseClient } from '@/lib/supabase'
import { stripe } from '@/lib/stripe-server'
import {
  ensureStripeCustomer,
  createSubscriptionForTenant,
} from '@/lib/stripe-subscriptions'
import { notify } from '@/lib/notify'

export async function POST(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session || session.role !== 'tenant') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const {
      stripePaymentMethodId,
      type,
      last4,
      brand,
      bankName,
      verificationStatus,  // 'verified' (default) or 'pending_microdeposits'
      setupIntentId,       // required if verificationStatus === 'pending_microdeposits'
    } = await request.json()

    if (!stripePaymentMethodId || !type) {
      return NextResponse.json(
        { error: 'Stripe payment method ID and type are required' },
        { status: 400 },
      )
    }
    if (type !== 'card' && type !== 'us_bank_account') {
      return NextResponse.json(
        { error: `Unsupported payment method type: ${type}` },
        { status: 400 },
      )
    }

    const verStatus: 'verified' | 'pending_microdeposits' =
      verificationStatus === 'pending_microdeposits' ? 'pending_microdeposits' : 'verified'

    if (verStatus === 'pending_microdeposits' && !setupIntentId) {
      return NextResponse.json(
        { error: 'setupIntentId is required when verificationStatus is pending_microdeposits' },
        { status: 400 },
      )
    }

    const supabase = createServerSupabaseClient()

    const { data: tenant, error: tenantError } = await supabase
      .from('tenants')
      .select('id, property_id, payment_due_day, first_name, last_name, email')
      .eq('user_id', session.userId)
      .maybeSingle()
    if (tenantError || !tenant) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })
    }

    // 1. Stripe Customer (idempotent)
    const stripeCustomerId = await ensureStripeCustomer(tenant.id)

    // 2. Attach the PM. SKIP this for microdeposit-pending us_bank_account
    //    PMs — Stripe explicitly rejects manual attach for those and auto-
    //    attaches them when stripe.setupIntents.verifyMicrodeposits succeeds.
    //    For cards + Financial-Connections ACH, attach is idempotent.
    if (verStatus !== 'pending_microdeposits') {
      try {
        await stripe.paymentMethods.attach(stripePaymentMethodId, {
          customer: stripeCustomerId,
        })
      } catch (err) {
        if (err instanceof Error && !/already been attached/i.test(err.message)) {
          console.error('Failed to attach PaymentMethod:', err)
          return NextResponse.json(
            { error: 'Failed to attach payment method' },
            { status: 500 },
          )
        }
      }
    }

    // 3. Local mirror row.
    // Default-PM rules: only mark default if (a) verified AND (b) no other
    // verified PM exists. Unverified PMs are never default — they can't
    // be charged so they can't back a subscription.
    const { data: existingVerified } = await supabase
      .from('payment_methods')
      .select('id')
      .eq('tenant_id', tenant.id)
      .eq('verification_status', 'verified')
    const isFirstVerified = (!existingVerified || existingVerified.length === 0) && verStatus === 'verified'

    const { data: newPaymentMethod, error: insertError } = await supabase
      .from('payment_methods')
      .insert({
        tenant_id: tenant.id,
        stripe_payment_method_id: stripePaymentMethodId,
        type,
        last4: last4 || null,
        card_brand: brand || null,
        bank_name: bankName || null,
        is_default: isFirstVerified,
        verification_status: verStatus,
        setup_intent_id: verStatus === 'pending_microdeposits' ? setupIntentId : null,
      })
      .select()
      .single()

    if (insertError) {
      console.error('Payment method insert failed:', insertError)
      return NextResponse.json(
        { error: 'Failed to save payment method locally' },
        { status: 500 },
      )
    }

    // 4. If this is the first VERIFIED PM AND tenant has a property,
    //    spin up the Stripe Subscription so monthly auto-charges start.
    //    Unverified PMs skip this — subscription is created later when the
    //    microdeposit verification succeeds.
    let subscriptionCreated = false
    if (isFirstVerified && tenant.property_id) {
      const { data: property } = await supabase
        .from('properties')
        .select('rent_amount')
        .eq('id', tenant.property_id)
        .maybeSingle()

      if (property?.rent_amount) {
        try {
          await createSubscriptionForTenant(
            {
              tenantId: tenant.id,
              email: tenant.email,
              firstName: tenant.first_name,
              lastName: tenant.last_name,
              rentAmount: Number(property.rent_amount),
              paymentDueDay: tenant.payment_due_day,
            },
            stripePaymentMethodId,
          )
          subscriptionCreated = true
          notify.subscriptionCreated({
            email: tenant.email,
            firstName: tenant.first_name,
            lastName: tenant.last_name,
            rentAmount: Number(property.rent_amount),
            paymentMethodType: type,
          })
        } catch (err) {
          // Don't block the PM-add response on subscription-create failure —
          // the PM is saved and admin can manually trigger subscription
          // creation later. Log loudly though.
          console.error('Subscription creation failed (PM still saved):', err)
        }
      }
    }

    return NextResponse.json({
      success: true,
      message: verStatus === 'pending_microdeposits'
        ? 'Bank account saved. Stripe sent two small test deposits — check your account in 1-2 business days, then come back to verify.'
        : `${type === 'card' ? 'Card' : 'Bank account'} added`,
      paymentMethod: {
        id: newPaymentMethod.id,
        type: newPaymentMethod.type,
        last4: newPaymentMethod.last4,
        is_default: newPaymentMethod.is_default,
        verification_status: newPaymentMethod.verification_status,
      },
      subscriptionCreated,
      // Frontend uses this to redirect to /tenant/payment-methods/<id>/verify
      // when verification is pending.
      requiresVerification: verStatus === 'pending_microdeposits',
    })
  } catch (error) {
    console.error('Add payment method error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
