/**
 * POST /api/tenant/payment-methods/[id]/verify-microdeposits
 *
 * Tenant enters the two amounts Stripe sent to their bank account.
 * Stripe verifies them via stripe.setupIntents.verifyMicrodeposits.
 * On success: PM is verified, can be used for charging. If it's the
 * tenant's first verified PM and they have a property, also kick off
 * the Stripe Subscription so monthly auto-pay starts.
 *
 * In TEST MODE, the amounts are always 32 and 45 cents — Stripe's
 * documented test pair (see https://docs.stripe.com/payments/ach-direct-debit/set-up-payment#test-account-numbers).
 *
 * Body: { amounts: [<cents>, <cents>] }   e.g. { "amounts": [32, 45] }
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { createServerSupabaseClient } from '@/lib/supabase'
import { stripe } from '@/lib/stripe-server'
import { createSubscriptionForTenant } from '@/lib/stripe-subscriptions'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getSession()
    if (!session || session.role !== 'tenant') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params
    const { amounts } = await request.json()
    if (!Array.isArray(amounts) || amounts.length !== 2) {
      return NextResponse.json(
        { error: 'amounts must be a two-element array of cent integers' },
        { status: 400 },
      )
    }
    const [a, b] = amounts.map((n) => Number(n))
    if (!Number.isInteger(a) || !Number.isInteger(b) || a < 1 || b < 1 || a > 99 || b > 99) {
      return NextResponse.json(
        { error: 'Each amount must be a whole number of cents between 1 and 99' },
        { status: 400 },
      )
    }

    const supabase = createServerSupabaseClient()

    const { data: pm, error: pmError } = await supabase
      .from('payment_methods')
      .select('id, tenant_id, stripe_payment_method_id, type, last4, verification_status, setup_intent_id')
      .eq('id', id)
      .maybeSingle()
    if (pmError || !pm) {
      return NextResponse.json({ error: 'Payment method not found' }, { status: 404 })
    }
    if (pm.verification_status === 'verified') {
      return NextResponse.json({ error: 'Already verified' }, { status: 400 })
    }
    if (pm.verification_status !== 'pending_microdeposits' || !pm.setup_intent_id) {
      return NextResponse.json(
        { error: 'This payment method is not pending microdeposit verification' },
        { status: 400 },
      )
    }

    // Ownership check
    const { data: tenant } = await supabase
      .from('tenants')
      .select('id, user_id, property_id, payment_due_day, first_name, last_name, email')
      .eq('id', pm.tenant_id)
      .maybeSingle()
    if (!tenant || tenant.user_id !== session.userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Call Stripe to verify
    try {
      await stripe.setupIntents.verifyMicrodeposits(pm.setup_intent_id, {
        amounts: [a, b],
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Verification failed'
      // Stripe gives the tenant up to 10 attempts. On final failure the
      // SetupIntent transitions to canceled and the PM becomes unusable.
      if (/maximum.*attempts|canceled/i.test(msg)) {
        await supabase
          .from('payment_methods')
          .update({ verification_status: 'failed' })
          .eq('id', id)
      }
      return NextResponse.json(
        { error: msg, attemptsExhausted: /maximum.*attempts|canceled/i.test(msg) },
        { status: 400 },
      )
    }

    // Success — mark verified. If this is the first verified PM for the
    // tenant, ALSO set as default and create the Stripe Subscription.
    const { data: existingVerified } = await supabase
      .from('payment_methods')
      .select('id')
      .eq('tenant_id', pm.tenant_id)
      .eq('verification_status', 'verified')
    const isFirstVerified = !existingVerified || existingVerified.length === 0

    await supabase
      .from('payment_methods')
      .update({
        verification_status: 'verified',
        is_default: isFirstVerified,
      })
      .eq('id', id)

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
            pm.stripe_payment_method_id,
          )
          subscriptionCreated = true
        } catch (err) {
          console.error('Subscription creation failed after microdeposit verification:', err)
        }
      }
    }

    return NextResponse.json({
      success: true,
      message: `Bank account ending in ${pm.last4 ?? '••••'} verified.`,
      subscriptionCreated,
    })
  } catch (error) {
    console.error('Verify microdeposits error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
