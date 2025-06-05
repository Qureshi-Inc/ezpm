import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { createServerSupabaseClient } from '@/lib/supabase'
import { stripe } from '@/lib/stripe-server'

export async function POST(request: NextRequest) {
  try {
    await requireAdmin()
    
    const supabase = createServerSupabaseClient()
    const today = new Date()
    const currentDay = today.getDate()
    
    console.log(`Processing auto payments for day ${currentDay}`)

    // Get all active auto payments for today
    const { data: autoPayments, error: autoPayError } = await supabase
      .from('auto_payments')
      .select(`
        *,
        tenant:tenants(
          id,
          first_name,
          last_name,
          stripe_customer_id,
          property:properties(rent_amount)
        ),
        payment_method:payment_methods(
          id,
          stripe_payment_method_id,
          type,
          last4
        )
      `)
      .eq('is_active', true)
      .eq('day_of_month', currentDay)

    if (autoPayError) {
      console.error('Error fetching auto payments:', autoPayError)
      return NextResponse.json(
        { error: 'Failed to fetch auto payments' },
        { status: 500 }
      )
    }

    if (!autoPayments || autoPayments.length === 0) {
      return NextResponse.json({
        success: true,
        message: `No auto payments scheduled for day ${currentDay}`,
        processed: 0,
        skipped: 0,
        failed: 0
      })
    }

    console.log(`Found ${autoPayments.length} auto payments to process`)

    const results = {
      processed: 0,
      skipped: 0,
      failed: 0,
      details: [] as any[]
    }

    for (const autoPayment of autoPayments) {
      const tenant = autoPayment.tenant
      const paymentMethod = autoPayment.payment_method

      if (!tenant || !paymentMethod) {
        console.log(`Skipping auto payment ${autoPayment.id}: missing tenant or payment method`)
        results.failed++
        results.details.push({
          autoPaymentId: autoPayment.id,
          tenantName: 'Unknown',
          status: 'failed',
          reason: 'Missing tenant or payment method data'
        })
        continue
      }

      const tenantName = `${tenant.first_name} ${tenant.last_name}`
      
      try {
        // Check if there's already a payment for this month
        const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1)
        const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0)
        
        const { data: existingPayments } = await supabase
          .from('payments')
          .select('id, status, amount')
          .eq('tenant_id', tenant.id)
          .gte('due_date', startOfMonth.toISOString().split('T')[0])
          .lte('due_date', endOfMonth.toISOString().split('T')[0])
          .in('status', ['succeeded', 'processing'])

        if (existingPayments && existingPayments.length > 0) {
          console.log(`Skipping auto payment for ${tenantName}: manual payment already exists this month`)
          results.skipped++
          results.details.push({
            autoPaymentId: autoPayment.id,
            tenantName,
            status: 'skipped',
            reason: 'Manual payment already made this month'
          })
          continue
        }

        // Check if there's a pending payment for this month
        const { data: pendingPayments } = await supabase
          .from('payments')
          .select('id, due_date, amount')
          .eq('tenant_id', tenant.id)
          .eq('status', 'pending')
          .gte('due_date', startOfMonth.toISOString().split('T')[0])
          .lte('due_date', endOfMonth.toISOString().split('T')[0])

        let paymentToProcess = null
        
        if (pendingPayments && pendingPayments.length > 0) {
          // Use existing pending payment
          paymentToProcess = pendingPayments[0]
          console.log(`Using existing pending payment for ${tenantName}`)
        } else {
          // Create new payment for this month
          if (!tenant.property?.rent_amount) {
            console.log(`Skipping auto payment for ${tenantName}: no rent amount set`)
            results.failed++
            results.details.push({
              autoPaymentId: autoPayment.id,
              tenantName,
              status: 'failed',
              reason: 'No rent amount set for property'
            })
            continue
          }

          const dueDate = new Date(today.getFullYear(), today.getMonth(), autoPayment.day_of_month)
          
          const { data: newPayment, error: paymentError } = await supabase
            .from('payments')
            .insert({
              tenant_id: tenant.id,
              property_id: tenant.property.id,
              amount: tenant.property.rent_amount,
              due_date: dueDate.toISOString().split('T')[0],
              status: 'pending'
            })
            .select()
            .single()

          if (paymentError) {
            console.error(`Failed to create payment for ${tenantName}:`, paymentError)
            results.failed++
            results.details.push({
              autoPaymentId: autoPayment.id,
              tenantName,
              status: 'failed',
              reason: 'Failed to create payment record'
            })
            continue
          }

          paymentToProcess = newPayment
          console.log(`Created new payment for ${tenantName}`)
        }

        // Process payment with Stripe
        const paymentIntentData: any = {
          amount: Math.round(paymentToProcess.amount * 100), // Convert to cents
          currency: 'usd',
          payment_method: paymentMethod.stripe_payment_method_id,
          confirm: true,
          metadata: {
            tenant_id: tenant.id,
            payment_id: paymentToProcess.id,
            auto_payment: 'true'
          },
        }

        // Add customer if available
        if (tenant.stripe_customer_id) {
          paymentIntentData.customer = tenant.stripe_customer_id
        }

        const paymentIntent = await stripe.paymentIntents.create(paymentIntentData)

        console.log(`PaymentIntent created for ${tenantName}: ${paymentIntent.id}, Status: ${paymentIntent.status}`)

        if (paymentIntent.status === 'succeeded') {
          // Update payment status immediately
          await supabase
            .from('payments')
            .update({ 
              status: 'succeeded',
              stripe_payment_intent_id: paymentIntent.id,
              paid_at: new Date().toISOString(),
              payment_method_id: paymentMethod.id
            })
            .eq('id', paymentToProcess.id)

          results.processed++
          results.details.push({
            autoPaymentId: autoPayment.id,
            tenantName,
            status: 'processed',
            amount: paymentToProcess.amount,
            paymentIntentId: paymentIntent.id
          })
        } else if (paymentIntent.status === 'requires_action') {
          // Update to processing status, webhook will handle completion
          await supabase
            .from('payments')
            .update({ 
              status: 'processing',
              stripe_payment_intent_id: paymentIntent.id
            })
            .eq('id', paymentToProcess.id)

          results.processed++
          results.details.push({
            autoPaymentId: autoPayment.id,
            tenantName,
            status: 'processing',
            amount: paymentToProcess.amount,
            paymentIntentId: paymentIntent.id
          })
        } else {
          // Payment failed
          await supabase
            .from('payments')
            .update({ 
              status: 'failed',
              stripe_payment_intent_id: paymentIntent.id
            })
            .eq('id', paymentToProcess.id)

          results.failed++
          results.details.push({
            autoPaymentId: autoPayment.id,
            tenantName,
            status: 'failed',
            reason: `Payment ${paymentIntent.status}`,
            paymentIntentId: paymentIntent.id
          })
        }

      } catch (error) {
        console.error(`Error processing auto payment for ${tenantName}:`, error)
        results.failed++
        results.details.push({
          autoPaymentId: autoPayment.id,
          tenantName,
          status: 'failed',
          reason: error instanceof Error ? error.message : 'Unknown error'
        })
      }
    }

    console.log(`Auto payment processing complete: ${results.processed} processed, ${results.skipped} skipped, ${results.failed} failed`)

    return NextResponse.json({
      success: true,
      message: `Auto payment processing complete`,
      ...results
    })

  } catch (error) {
    console.error('Auto payment processing error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
} 