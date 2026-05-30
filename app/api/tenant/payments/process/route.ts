/**
 * POST /api/tenant/payments/process — settle an open Stripe Invoice with a
 * specific payment method.
 *
 * Used by the "Pay Now" button when the tenant wants to settle the current
 * open invoice immediately (e.g. retry after a failed auto-charge, or pay
 * early). For ongoing monthly rent, Stripe Subscriptions handles the charge
 * automatically — this route is the manual escape hatch.
 *
 * Body: { paymentId, paymentMethodId }
 *   paymentId        - row from local payments table (must have stripe_invoice_id)
 *   paymentMethodId  - row from local payment_methods table
 *
 * On success: the invoice is paid; the webhook handler will mirror the
 * status flip to the payments table. We return the new Stripe-side state.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { createServerSupabaseClient } from '@/lib/supabase'
import { payInvoice } from '@/lib/stripe-subscriptions'

export async function POST(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session || session.role !== 'tenant') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { paymentId, paymentMethodId } = await request.json()
    if (!paymentId || !paymentMethodId) {
      return NextResponse.json(
        { error: 'Missing payment ID or payment method ID' },
        { status: 400 },
      )
    }

    const supabase = createServerSupabaseClient()

    // Load payment + tenant + payment_method in three small queries.
    // Tenant ownership is enforced by chaining tenant.user_id = session.userId.
    const { data: payment, error: paymentError } = await supabase
      .from('payments')
      .select('id, tenant_id, status, stripe_invoice_id, amount')
      .eq('id', paymentId)
      .maybeSingle()
    if (paymentError || !payment) {
      return NextResponse.json({ error: 'Payment not found' }, { status: 404 })
    }
    if (!payment.stripe_invoice_id) {
      // Local row without a Stripe invoice — shouldn't happen post-cutover
      // (every payments row is created by the webhook from a Stripe Invoice)
      // but worth a clear error if it does.
      return NextResponse.json(
        { error: 'This payment is not linked to a Stripe invoice. Contact admin.' },
        { status: 400 },
      )
    }
    if (payment.status === 'succeeded') {
      return NextResponse.json(
        { error: 'Payment already succeeded' },
        { status: 400 },
      )
    }

    const { data: tenant, error: tenantError } = await supabase
      .from('tenants')
      .select('id, user_id')
      .eq('id', payment.tenant_id)
      .maybeSingle()
    if (tenantError || !tenant || tenant.user_id !== session.userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    const { data: paymentMethod, error: pmError } = await supabase
      .from('payment_methods')
      .select('id, stripe_payment_method_id, tenant_id')
      .eq('id', paymentMethodId)
      .eq('tenant_id', tenant.id)
      .maybeSingle()
    if (pmError || !paymentMethod) {
      return NextResponse.json(
        { error: 'Payment method not found' },
        { status: 404 },
      )
    }

    try {
      const invoice = await payInvoice(
        payment.stripe_invoice_id,
        paymentMethod.stripe_payment_method_id,
      )

      // Mirror update happens via webhook; we return Stripe's view of the
      // invoice so the UI can render immediately.
      return NextResponse.json({
        success: true,
        message: invoice.status === 'paid'
          ? 'Payment succeeded'
          : `Invoice is ${invoice.status} — final status will arrive via webhook`,
        invoice: {
          id: invoice.id,
          status: invoice.status,
          amount_paid: (invoice.amount_paid ?? 0) / 100,
        },
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Stripe pay-invoice failed'
      console.error('Stripe pay-invoice failed:', err)
      return NextResponse.json({ error: message }, { status: 400 })
    }
  } catch (error) {
    console.error('Process payment crash:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
