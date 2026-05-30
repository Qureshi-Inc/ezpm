/**
 * DELETE /api/tenant/payment-methods/[id] — detach a PaymentMethod from
 * the tenant's Stripe Customer AND remove the local mirror.
 *
 * Refuses deletion if the PM is the active default on a live Stripe
 * Subscription — tenant would have nothing for next month's auto-charge.
 * Tenant must promote another PM to default first (or admin can swap
 * the subscription's default_payment_method server-side).
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { createServerSupabaseClient } from '@/lib/supabase'
import { stripe } from '@/lib/stripe-server'

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getSession()
    if (!session || session.role !== 'tenant') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params
    const supabase = createServerSupabaseClient()

    const { data: paymentMethod, error: fetchError } = await supabase
      .from('payment_methods')
      .select('id, tenant_id, type, last4, is_default, stripe_payment_method_id')
      .eq('id', id)
      .maybeSingle()
    if (fetchError || !paymentMethod) {
      return NextResponse.json({ error: 'Payment method not found' }, { status: 404 })
    }

    // Ownership check via tenant.user_id
    const { data: tenant } = await supabase
      .from('tenants')
      .select('user_id, stripe_subscription_id')
      .eq('id', paymentMethod.tenant_id)
      .maybeSingle()
    if (!tenant || tenant.user_id !== session.userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Subscription guard
    if (paymentMethod.is_default && tenant.stripe_subscription_id) {
      return NextResponse.json(
        {
          error:
            'This is your default payment method and is wired to your monthly auto-pay subscription. Make another payment method default first, then delete this one.',
        },
        { status: 400 },
      )
    }

    // Detach from Stripe Customer (idempotent — already-detached returns
    // a Stripe error we swallow).
    try {
      await stripe.paymentMethods.detach(paymentMethod.stripe_payment_method_id)
    } catch (err) {
      if (err instanceof Error && !/is not attached/i.test(err.message)) {
        console.error('Stripe detach failed:', err)
      }
    }

    const { error: deleteError } = await supabase
      .from('payment_methods')
      .delete()
      .eq('id', id)
    if (deleteError) {
      console.error('Local PM delete failed:', deleteError)
      return NextResponse.json(
        { error: 'Failed to delete payment method' },
        { status: 500 },
      )
    }

    // Promote another method to default if we just removed the default.
    if (paymentMethod.is_default) {
      const { data: remaining } = await supabase
        .from('payment_methods')
        .select('id')
        .eq('tenant_id', paymentMethod.tenant_id)
        .order('created_at', { ascending: false })
        .limit(1)
      if (remaining && remaining.length > 0) {
        await supabase
          .from('payment_methods')
          .update({ is_default: true })
          .eq('id', remaining[0].id)
      }
    }

    return NextResponse.json({
      success: true,
      message: `${paymentMethod.type === 'card' ? 'Card' : 'Bank account'} ending in ${paymentMethod.last4} removed`,
    })
  } catch (error) {
    console.error('Delete payment method error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
