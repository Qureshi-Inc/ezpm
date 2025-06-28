import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { createServerSupabaseClient } from '@/lib/supabase'
import { createMoovAccount } from '@/lib/moov-server'

export async function POST(request: NextRequest) {
  try {
    console.log('Moov payment method request received')
    
    const session = await getSession()
    console.log('Session:', session ? { role: session.role, userId: session.userId } : 'No session')
    
    if (!session || session.role !== 'tenant') {
      console.log('Unauthorized access attempt')
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const requestData = await request.json()
    console.log('Request data:', requestData)
    
    const { tenantId, moovPaymentMethodId, accountNumber, routingNumber } = requestData

    if (!tenantId || !moovPaymentMethodId || !accountNumber || !routingNumber) {
      console.log('Missing required fields:', { tenantId, moovPaymentMethodId, accountNumber: accountNumber ? '***' + accountNumber.slice(-4) : 'missing', routingNumber: routingNumber ? '***' + routingNumber.slice(-4) : 'missing' })
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    // Verify the tenant belongs to the current user
    const supabase = createServerSupabaseClient()
    
    console.log('Looking up tenant:', tenantId, 'for user:', session.userId)
    
    const { data: tenant, error: tenantError } = await supabase
      .from('tenants')
      .select('id, first_name, last_name, moov_account_id, user_id')
      .eq('id', tenantId)
      .eq('user_id', session.userId)
      .single()

    if (tenantError) {
      console.error('Tenant lookup error:', tenantError)
      return NextResponse.json(
        { error: 'Tenant not found or unauthorized' },
        { status: 404 }
      )
    }

    if (!tenant) {
      console.log('Tenant not found')
      return NextResponse.json(
        { error: 'Tenant not found or unauthorized' },
        { status: 404 }
      )
    }

    // Get user email
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('email')
      .eq('id', tenant.user_id)
      .single()

    if (userError) {
      console.error('User lookup error:', userError)
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      )
    }

    console.log('Tenant found:', { id: tenant.id, firstName: tenant.first_name, lastName: tenant.last_name, moovAccountId: tenant.moov_account_id })

    // Create Moov account if tenant doesn't have one
    let moovAccountId = tenant.moov_account_id
    
    if (!moovAccountId) {
      console.log('Creating new Moov account for tenant')
      try {
        const moovAccount = await createMoovAccount({
          firstName: tenant.first_name,
          lastName: tenant.last_name,
          email: user.email,
          tenantId: tenantId
        })
        
        console.log('Moov account created:', moovAccount)
        moovAccountId = moovAccount.accountID
        
        // Save the Moov account ID to the tenant
        const { error: updateError } = await supabase
          .from('tenants')
          .update({ moov_account_id: moovAccountId })
          .eq('id', tenantId)
          
        if (updateError) {
          console.error('Failed to save Moov account ID:', updateError)
          return NextResponse.json(
            { error: 'Failed to create Moov account' },
            { status: 500 }
          )
        }
        
        console.log('Moov account ID saved to tenant')
      } catch (error) {
        console.error('Failed to create Moov account:', error)
        return NextResponse.json(
          { error: 'Failed to create Moov account' },
          { status: 500 }
        )
      }
    } else {
      console.log('Using existing Moov account:', moovAccountId)
    }

    // Save the payment method to the database
    const paymentMethodData = {
      tenant_id: tenantId,
      type: 'moov_ach',
      moov_payment_method_id: moovPaymentMethodId,
      last4: accountNumber.slice(-4),
      is_default: false
    }

    console.log('Saving payment method:', { ...paymentMethodData, last4: '***' + paymentMethodData.last4 })

    const { data: paymentMethod, error: pmError } = await supabase
      .from('payment_methods')
      .insert(paymentMethodData)
      .select()
      .single()

    if (pmError) {
      console.error('Failed to save payment method:', pmError)
      return NextResponse.json(
        { error: 'Failed to save payment method' },
        { status: 500 }
      )
    }

    console.log('Payment method saved successfully:', paymentMethod)

    return NextResponse.json({ 
      paymentMethod,
      moovAccountId 
    })
    
  } catch (error) {
    console.error('Failed to add Moov payment method:', error)
    return NextResponse.json(
      { error: 'Failed to add payment method' },
      { status: 500 }
    )
  }
} 