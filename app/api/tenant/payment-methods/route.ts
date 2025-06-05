import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { createServerSupabaseClient } from '@/lib/supabase'
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

    const { tenantId, stripePaymentMethodId, type, last4, brand } = await request.json()

    if (!tenantId || !stripePaymentMethodId || !type) {
      return NextResponse.json(
        { error: 'Tenant ID, Stripe payment method ID, and type are required' },
        { status: 400 }
      )
    }

    // Verify the tenant belongs to the current user and get tenant info
    const supabase = createServerSupabaseClient()
    
    const { data: tenant, error: tenantError } = await supabase
      .from('tenants')
      .select(`
        id, 
        first_name, 
        last_name, 
        stripe_customer_id,
        users!inner(email)
      `)
      .eq('id', tenantId)
      .eq('user_id', session.userId)
      .single()

    if (tenantError || !tenant) {
      return NextResponse.json(
        { error: 'Tenant not found or unauthorized' },
        { status: 404 }
      )
    }

    // Ensure the tenant has a Stripe Customer
    let stripeCustomerId = tenant.stripe_customer_id
    
    if (!stripeCustomerId) {
      try {
        // Create a new Stripe Customer
        const customer = await stripe.customers.create({
          email: tenant.users[0]?.email,
          name: `${tenant.first_name} ${tenant.last_name}`,
          metadata: {
            tenant_id: tenantId,
          },
        })
        
        stripeCustomerId = customer.id
        
        // Save the customer ID to the database
        const { error: updateError } = await supabase
          .from('tenants')
          .update({ stripe_customer_id: stripeCustomerId })
          .eq('id', tenantId)
          
        if (updateError) {
          console.error('Failed to save Stripe customer ID:', updateError)
          return NextResponse.json(
            { error: 'Failed to create customer account' },
            { status: 500 }
          )
        }
        
        console.log(`Created Stripe customer ${stripeCustomerId} for tenant ${tenantId}`)
      } catch (error) {
        console.error('Failed to create Stripe customer:', error)
        return NextResponse.json(
          { error: 'Failed to create customer account' },
          { status: 500 }
        )
      }
    }

    // Attach the payment method to the customer
    try {
      await stripe.paymentMethods.attach(stripePaymentMethodId, {
        customer: stripeCustomerId,
      })
      console.log(`Attached payment method ${stripePaymentMethodId} to customer ${stripeCustomerId}`)
    } catch (error) {
      console.error('Failed to attach payment method to customer:', error)
      return NextResponse.json(
        { error: 'Failed to attach payment method to customer' },
        { status: 500 }
      )
    }

    // Payment method data for database
    const paymentMethodData: any = {
      tenant_id: tenantId,
      type: type,
      stripe_payment_method_id: stripePaymentMethodId,
      last4: last4 || '',
    }

    // Note: brand information will be added once the brand column is created

    // Check if this is the first payment method (make it default)
    const { data: existingMethods } = await supabase
      .from('payment_methods')
      .select('id')
      .eq('tenant_id', tenantId)

    const isFirstMethod = !existingMethods || existingMethods.length === 0
    paymentMethodData.is_default = isFirstMethod

    // Insert the payment method
    const { data: newPaymentMethod, error: insertError } = await supabase
      .from('payment_methods')
      .insert(paymentMethodData)
      .select()
      .single()

    if (insertError) {
      console.error('Payment method creation error:', insertError)
      return NextResponse.json(
        { error: 'Failed to save payment method' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      message: `${type === 'card' ? 'Card' : 'Bank account'} added successfully`,
      paymentMethod: {
        id: newPaymentMethod.id,
        type: newPaymentMethod.type,
        last4: newPaymentMethod.last4,
        is_default: newPaymentMethod.is_default
      }
    })

  } catch (error) {
    console.error('Add payment method error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
} 