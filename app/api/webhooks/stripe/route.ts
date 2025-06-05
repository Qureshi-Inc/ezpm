import { NextRequest, NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { createServerSupabaseClient } from '@/lib/supabase'
import { verifyWebhookSignature } from '@/lib/stripe-server'
import { calculateNextDueDate, generatePaymentForTenant } from '@/utils/payment-generation'

export async function POST(request: NextRequest) {
  try {
    const body = await request.text()
    const headersList = await headers()
    const signature = headersList.get('stripe-signature')

    if (!signature) {
      console.error('No Stripe signature found')
      return NextResponse.json({ error: 'No signature' }, { status: 400 })
    }

    // Verify webhook signature
    let event
    try {
      event = verifyWebhookSignature(body, signature)
    } catch (err) {
      console.error('Webhook signature verification failed:', err)
      return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
    }

    console.log('Received Stripe webhook:', event.type, event.id)

    const supabase = createServerSupabaseClient()

    switch (event.type) {
      case 'payment_intent.succeeded': {
        const paymentIntent = event.data.object
        const tenantId = paymentIntent.metadata?.tenant_id
        const paymentId = paymentIntent.metadata?.payment_id

        if (!tenantId || !paymentId) {
          console.error('Missing metadata in PaymentIntent:', paymentIntent.id)
          break
        }

        console.log(`Payment succeeded: ${paymentIntent.id} for tenant ${tenantId}`)

        // Update payment status
        const { error: updateError } = await supabase
          .from('payments')
          .update({
            status: 'succeeded',
            stripe_payment_intent_id: paymentIntent.id,
            paid_at: new Date().toISOString(),
          })
          .eq('id', paymentId)

        if (updateError) {
          console.error('Failed to update payment status:', updateError)
          break
        }

        // Get tenant info for next payment generation
        const { data: tenant } = await supabase
          .from('tenants')
          .select('payment_due_day')
          .eq('id', tenantId)
          .single()

        if (tenant) {
          // Get the current payment to calculate next due date
          const { data: currentPayment } = await supabase
            .from('payments')
            .select('due_date')
            .eq('id', paymentId)
            .single()

          if (currentPayment) {
            try {
              const currentDueDate = new Date(currentPayment.due_date)
              const nextMonth = new Date(currentDueDate.getFullYear(), currentDueDate.getMonth() + 1, 1)
              const nextDueDate = calculateNextDueDate(tenant.payment_due_day, nextMonth)
              
              // Only generate next payment if it's within 5 days of the due date
              const today = new Date()
              const daysUntilDue = Math.ceil((nextDueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
              
              if (daysUntilDue <= 5) {
                await generatePaymentForTenant(tenantId, nextDueDate, supabase)
                console.log(`Generated next payment for tenant ${tenantId} due on ${nextDueDate.toISOString().split('T')[0]}`)
              } else {
                console.log(`Next payment for tenant ${tenantId} not yet due (${daysUntilDue} days away), skipping generation`)
              }
            } catch (error) {
              console.error('Failed to generate next payment:', error)
            }
          }
        }

        break
      }

      case 'payment_intent.payment_failed': {
        const paymentIntent = event.data.object
        const paymentId = paymentIntent.metadata?.payment_id

        if (!paymentId) {
          console.error('Missing payment_id in PaymentIntent metadata:', paymentIntent.id)
          break
        }

        console.log(`Payment failed: ${paymentIntent.id}`)

        // Update payment status to failed
        const { error: updateError } = await supabase
          .from('payments')
          .update({
            status: 'failed',
            stripe_payment_intent_id: paymentIntent.id,
          })
          .eq('id', paymentId)

        if (updateError) {
          console.error('Failed to update payment status:', updateError)
        }

        break
      }

      case 'payment_method.attached': {
        const paymentMethod = event.data.object
        console.log(`Payment method attached: ${paymentMethod.id}`)
        break
      }

      default:
        console.log(`Unhandled event type: ${event.type}`)
    }

    return NextResponse.json({ received: true })

  } catch (error) {
    console.error('Webhook error:', error)
    return NextResponse.json(
      { error: 'Webhook handler failed' },
      { status: 500 }
    )
  }
} 