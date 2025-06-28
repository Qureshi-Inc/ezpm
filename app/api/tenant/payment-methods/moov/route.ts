import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { createServerSupabaseClient } from '@/lib/supabase'
import { createMoovAccount, createBankAccount } from '@/lib/moov-server'

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
    
    const { tenantId, accountNumber, routingNumber, accountType = 'checking', accountHolderName } = requestData

    if (!tenantId || !accountNumber || !routingNumber || !accountHolderName) {
      console.log('Missing required fields:', { 
        tenantId, 
        accountNumber: accountNumber ? '***' + accountNumber.slice(-4) : 'missing', 
        routingNumber: routingNumber ? '***' + routingNumber.slice(-4) : 'missing',
        accountHolderName: accountHolderName ? '***' + accountHolderName.slice(-4) : 'missing'
      })
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

    // Check for existing payment method with the same account number
    const { data: existingPaymentMethod, error: checkError } = await supabase
      .from('payment_methods')
      .select('id, last4')
      .eq('tenant_id', tenantId)
      .eq('type', 'moov_ach')
      .eq('last4', accountNumber.slice(-4))
      .single()

    if (checkError && checkError.code !== 'PGRST116') { // PGRST116 is "not found" error
      console.error('Error checking for existing payment method:', checkError)
      return NextResponse.json(
        { error: 'Failed to check for existing payment method' },
        { status: 500 }
      )
    }

    if (existingPaymentMethod) {
      console.log('Payment method with same account number already exists:', existingPaymentMethod)
      return NextResponse.json(
        { error: 'A payment method with this account number already exists' },
        { status: 400 }
      )
    }

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

    // Create the bank account in Moov
    console.log('Creating bank account in Moov for account:', moovAccountId)
    let moovBankAccountId: string
    
    try {
      const bankAccount = await createBankAccount(moovAccountId, {
        accountNumber,
        routingNumber,
        accountType: accountType as 'checking' | 'savings',
        accountHolderName
      })
      
      moovBankAccountId = bankAccount.paymentMethodID
      console.log('Bank account created in Moov:', moovBankAccountId)
    } catch (error) {
      console.error('Failed to create bank account in Moov:', error)
      return NextResponse.json(
        { error: 'Failed to create bank account. Please verify your account information and try again.' },
        { status: 400 }
      )
    }

    // Save the payment method to the database
    const paymentMethodData = {
      tenant_id: tenantId,
      type: 'moov_ach',
      moov_payment_method_id: moovBankAccountId,
      last4: accountNumber.slice(-4),
      is_default: false,
      stripe_payment_method_id: null // Explicitly set to null for Moov payment methods
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
      moovAccountId,
      moovBankAccountId
    })
    
  } catch (error) {
    console.error('Failed to add Moov payment method:', error)
    return NextResponse.json(
      { error: 'Failed to add payment method' },
      { status: 500 }
    )
  }
} 