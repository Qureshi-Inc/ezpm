/**
 * POST /api/tenant/payment-methods/details — retrieve a freshly-attached
 * Stripe PaymentMethod and return display details (type, last4, brand,
 * bank name) so the client can persist the local mirror.
 *
 * Necessary because stripe.confirmSetup() returns only the PM id, not the
 * decorative fields. We don't want the client to call Stripe directly with
 * a publishable key (which can read PMs but not safely scope to one tenant).
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { createServerSupabaseClient } from '@/lib/supabase'
import { stripe } from '@/lib/stripe-server'

export async function POST(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session || session.role !== 'tenant') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { paymentMethodId } = await request.json()
    if (!paymentMethodId) {
      return NextResponse.json({ error: 'paymentMethodId required' }, { status: 400 })
    }

    // Validate ownership: the PM must be attached to the tenant's Stripe Customer.
    const supabase = createServerSupabaseClient()
    const { data: tenant } = await supabase
      .from('tenants')
      .select('stripe_customer_id')
      .eq('user_id', session.userId)
      .maybeSingle()
    if (!tenant?.stripe_customer_id) {
      return NextResponse.json({ error: 'Tenant has no Stripe Customer' }, { status: 400 })
    }

    const pm = await stripe.paymentMethods.retrieve(paymentMethodId)
    const attachedCustomerId = typeof pm.customer === 'string' ? pm.customer : pm.customer?.id
    if (attachedCustomerId !== tenant.stripe_customer_id) {
      return NextResponse.json(
        { error: 'PaymentMethod is not attached to your Stripe Customer' },
        { status: 403 },
      )
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
