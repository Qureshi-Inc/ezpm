/**
 * POST /api/tenant/payment-methods — tenant attaches a Stripe PaymentMethod
 * (created client-side via Stripe Elements or Financial Connections) to
 * their Stripe Customer + persists a local mirror row.
 *
 * Side effects:
 * 1. Ensures the tenant has a Stripe Customer (creates one if missing).
 * 2. Attaches the PM to the customer.
 * 3. If this is the tenant's first payment method AND the tenant has an
 *    assigned property with a rent amount, creates a Stripe Subscription
 *    so monthly auto-charges start firing.
 * 4. Marks this PM as default if it's the first.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { createServerSupabaseClient } from '@/lib/supabase'
import { stripe } from '@/lib/stripe-server'
import {
  ensureStripeCustomer,
  createSubscriptionForTenant,
} from '@/lib/stripe-subscriptions'

export async function POST(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session || session.role !== 'tenant') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { stripePaymentMethodId, type, last4, brand, bankName } = await request.json()
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

    const supabase = createServerSupabaseClient()

    // Look up the tenant from the session's user_id (not a tenantId param,
    // which would let one tenant attach a PM to another).
    const { data: tenant, error: tenantError } = await supabase
      .from('tenants')
      .select('id, property_id, payment_due_day, first_name, last_name, email')
      .eq('user_id', session.userId)
      .maybeSingle()
    if (tenantError || !tenant) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })
    }

    // 1. Stripe Customer (creates if missing, idempotent if not)
    const stripeCustomerId = await ensureStripeCustomer(tenant.id)

    // 2. Attach the PM. Stripe is also idempotent here — attaching an
    //    already-attached PM is a no-op.
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

    // 3. Local mirror row
    const { data: existingMethods } = await supabase
      .from('payment_methods')
      .select('id')
      .eq('tenant_id', tenant.id)
    const isFirstMethod = !existingMethods || existingMethods.length === 0

    const { data: newPaymentMethod, error: insertError } = await supabase
      .from('payment_methods')
      .insert({
        tenant_id: tenant.id,
        stripe_payment_method_id: stripePaymentMethodId,
        type,
        last4: last4 || null,
        card_brand: brand || null,
        bank_name: bankName || null,
        is_default: isFirstMethod,
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

    // 4. If this is the tenant's first PM AND they're assigned to a property,
    //    spin up the Stripe Subscription so auto-pay starts firing.
    let subscriptionCreated = false
    if (isFirstMethod && tenant.property_id) {
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
      message: `${type === 'card' ? 'Card' : 'Bank account'} added`,
      paymentMethod: {
        id: newPaymentMethod.id,
        type: newPaymentMethod.type,
        last4: newPaymentMethod.last4,
        is_default: newPaymentMethod.is_default,
      },
      subscriptionCreated,
    })
  } catch (error) {
    console.error('Add payment method error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
