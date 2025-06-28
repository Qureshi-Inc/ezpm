import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { createServerSupabaseClient } from '@/lib/supabase'
import { createTransfer } from '@/lib/moov-server'
import { calculateProcessingFee } from '@/utils/payment-fees'
import { stripe } from '@/lib/stripe-server'

export async function POST(request: NextRequest) {
  try {
    const session = await getSession()
    
    if (!session || session.role !== 'tenant') {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const { paymentId, paymentMethodId } = await request.json()

    if (!paymentId || !paymentMethodId) {
      return NextResponse.json(
        { error: 'Missing payment ID or payment method ID' },
        { status: 400 }
      )
    }

    const supabase = createServerSupabaseClient()

    // Get the payment
    const { data: payment, error: paymentError } = await supabase
      .from('payments')
      .select('*')
      .eq('id', paymentId)
      .single()

    if (paymentError || !payment) {
      return NextResponse.json(
        { error: 'Payment not found' },
        { status: 404 }
      )
    }

    // Get the tenant
    const { data: tenant, error: tenantError } = await supabase
      .from('tenants')
      .select('*')
      .eq('id', payment.tenant_id)
      .eq('user_id', session.userId)
      .single()

    if (tenantError || !tenant) {
      return NextResponse.json(
        { error: 'Tenant not found or unauthorized' },
        { status: 404 }
      )
    }

    const tenantId = tenant.id

    // If this is a retry of a failed payment, reset it to pending
    if (payment.status === 'failed') {
      console.log(`Retrying failed payment ${paymentId}`)
      const { error: resetError } = await supabase
        .from('payments')
        .update({ 
          status: 'pending',
          stripe_payment_intent_id: null // Clear old payment intent
        })
        .eq('id', paymentId)
        
      if (resetError) {
        console.error('Failed to reset payment status:', resetError)
        return NextResponse.json(
          { error: 'Failed to retry payment' },
          { status: 500 }
        )
      }
    }

    // Get the payment method
    const { data: paymentMethod, error: pmError } = await supabase
      .from('payment_methods')
      .select('*')
      .eq('id', paymentMethodId)
      .eq('tenant_id', tenantId)
      .single()

    if (pmError || !paymentMethod) {
      return NextResponse.json(
        { error: 'Payment method not found' },
        { status: 404 }
      )
    }

    // Calculate processing fee
    const processingFee = calculateProcessingFee(payment.amount, paymentMethod.type)
    const totalAmount = processingFee.totalWithFee

    console.log(`Processing payment: Base amount: $${payment.amount}, Fee: $${processingFee.amount}${paymentMethod.type === 'moov_ach' ? ' (absorbed by merchant)' : ''}, Total charged: $${totalAmount}`)

    // Process payment based on payment method type
    if (paymentMethod.type === 'moov_ach') {
      // Process Moov ACH payment
      try {
        // Get tenant's Moov account
        const { data: tenantWithMoov, error: tenantMoovError } = await supabase
          .from('tenants')
          .select('moov_account_id')
          .eq('id', tenantId)
          .single()

        if (tenantMoovError || !tenantWithMoov?.moov_account_id) {
          return NextResponse.json(
            { error: 'Moov account not found for tenant' },
            { status: 400 }
          )
        }

        console.log('Processing Moov ACH payment:', {
          tenantMoovAccountId: tenantWithMoov.moov_account_id,
          paymentMethodId: paymentMethod.moov_payment_method_id,
          baseAmount: payment.amount,
          processingFee: processingFee.amount,
          totalAmount: totalAmount
        })

        // Create actual transfer from tenant's bank account to merchant account
        const transfer = await createTransfer({
          sourceAccountId: tenantWithMoov.moov_account_id,
          destinationAccountId: process.env.MOOV_ACCOUNT_ID!, // Merchant account
          amount: totalAmount,
          description: `Rent payment for ${tenant.first_name} ${tenant.last_name}`,
          metadata: {
            tenant_id: tenantId,
            payment_id: paymentId,
            base_amount: payment.amount.toString(),
            processing_fee: processingFee.amount.toString()
          }
        })

        console.log('Moov transfer created:', transfer.transferID)

        // Update payment status
        const { error: updateError } = await supabase
          .from('payments')
          .update({ 
            status: 'processing', // ACH takes time to process
            moov_transfer_id: transfer.transferID,
            paid_at: new Date().toISOString(),
            payment_method_id: paymentMethodId
          })
          .eq('id', paymentId)

        if (updateError) {
          console.error('Payment update error:', updateError)
          return NextResponse.json(
            { error: 'Failed to update payment status' },
            { status: 500 }
          )
        }

        return NextResponse.json({
          success: true,
          message: 'ACH payment initiated. It will be processed within 1-3 business days.',
          payment: {
            id: payment.id,
            amount: payment.amount,
            processingFee: processingFee.amount,
            totalAmount: totalAmount,
            status: 'processing',
            moov_transfer_id: transfer.transferID,
            payment_method: {
              type: paymentMethod.type,
              last4: paymentMethod.last4
            }
          }
        })

      } catch (moovError: any) {
        console.error('Moov error:', moovError)
        
        // Update payment status to failed
        await supabase
          .from('payments')
          .update({ 
            status: 'failed'
          })
          .eq('id', paymentId)

        return NextResponse.json(
          { error: moovError.message || 'ACH payment processing failed. Please try again.' },
          { status: 400 }
        )
      }
    } else {
      // Process Stripe payment
      try {
        const paymentIntentData: any = {
          amount: Math.round(totalAmount * 100), // Convert to cents
          currency: 'usd',
          payment_method: paymentMethod.stripe_payment_method_id,
          confirm: true,
          return_url: `${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/tenant/payment-history`,
          metadata: {
            tenant_id: tenantId,
            payment_id: paymentId,
            base_amount: payment.amount,
            processing_fee: processingFee.amount
          },
        }

        // Add customer if available (enables payment method reuse)
        if (tenant.stripe_customer_id) {
          paymentIntentData.customer = tenant.stripe_customer_id
        }

        const paymentIntent = await stripe.paymentIntents.create(paymentIntentData)

        console.log('PaymentIntent created:', paymentIntent.id, 'Status:', paymentIntent.status)

        // Handle different PaymentIntent statuses
        if (paymentIntent.status === 'requires_action') {
          return NextResponse.json({
            requiresAction: true,
            clientSecret: paymentIntent.client_secret,
            paymentIntentId: paymentIntent.id,
          })
        } else if (paymentIntent.status === 'succeeded') {
          // Payment succeeded immediately
          const { error: updateError } = await supabase
            .from('payments')
            .update({ 
              status: 'succeeded',
              stripe_payment_intent_id: paymentIntent.id,
              paid_at: new Date().toISOString(),
              payment_method_id: paymentMethodId
            })
            .eq('id', paymentId)

          if (updateError) {
            console.error('Payment update error:', updateError)
            return NextResponse.json(
              { error: 'Failed to update payment status' },
              { status: 500 }
            )
          }

          // Next payment will be generated by webhook to avoid duplicates

          return NextResponse.json({
            success: true,
            message: 'Payment processed successfully',
            payment: {
              id: payment.id,
              amount: payment.amount,
              processingFee: processingFee.amount,
              totalAmount: totalAmount,
              status: 'succeeded',
              stripe_payment_intent_id: paymentIntent.id,
              payment_method: {
                type: paymentMethod.type,
                last4: paymentMethod.last4
              }
            }
          })
        } else {
          // Payment failed or other status
          await supabase
            .from('payments')
            .update({ 
              status: 'failed',
              stripe_payment_intent_id: paymentIntent.id
            })
            .eq('id', paymentId)

          return NextResponse.json(
            { error: `Payment ${paymentIntent.status}. Please try again or contact support.` },
            { status: 400 }
          )
        }
      } catch (stripeError: any) {
        console.error('Stripe error:', stripeError)
        
        // Update payment status to failed
        await supabase
          .from('payments')
          .update({ 
            status: 'failed'
          })
          .eq('id', paymentId)

        return NextResponse.json(
          { error: stripeError.message || 'Payment processing failed. Please try again.' },
          { status: 400 }
        )
      }
    }

  } catch (error) {
    console.error('Process payment error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
} 