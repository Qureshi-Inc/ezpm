import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { createServerSupabaseClient } from '@/lib/supabase'

const MOOV_DOMAIN = process.env.MOOV_DOMAIN || 'https://api.moov.io'
const MOOV_PUBLIC_KEY = process.env.MOOV_PUBLIC_KEY
const MOOV_SECRET_KEY = process.env.MOOV_SECRET_KEY

async function getAuthHeader() {
  const credentials = Buffer.from(`${MOOV_PUBLIC_KEY}:${MOOV_SECRET_KEY}`).toString('base64')
  return `Basic ${credentials}`
}

export async function POST(request: NextRequest) {
  try {
    console.log('🔐 Verification endpoint called')
    
    const session = await getSession()
    if (!session || session.role !== 'tenant') {
      console.error('❌ Unauthorized access attempt')
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const requestBody = await request.json()
    const { moovAccountId, bankAccountId, amounts } = requestBody
    
    console.log('📝 Request body:', requestBody)
    console.log('👤 Session user ID:', session.userId)

    if (!moovAccountId || !bankAccountId || !amounts || amounts.length !== 2) {
      console.error('❌ Missing required fields:', { moovAccountId, bankAccountId, amounts })
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    console.log('✅ All required fields present, proceeding with verification')
    console.log('🔍 Verification details:', {
      moovAccountId,
      bankAccountId,
      amounts
    })

    // First, check if micro-deposits exist, if not, initiate them
    const authHeader = await getAuthHeader()
    
    // Since we're submitting amounts, skip the check and go straight to verification
    console.log('🔍 Proceeding directly to verification since amounts were provided...')
    
    // Complete micro-deposit verification with Moov
    const response = await fetch(
      `${MOOV_DOMAIN}/accounts/${moovAccountId}/bank-accounts/${bankAccountId}/micro-deposits`,
      {
        method: 'PUT',
        headers: {
          'Authorization': authHeader,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ amounts })
      }
    )

    if (!response.ok) {
      const errorText = await response.text()
      console.error('Moov verification error:', errorText)
      
      // Parse error message for user-friendly feedback
      if (response.status === 400) {
        return NextResponse.json(
          { error: 'Incorrect amounts. Please check and try again.' },
          { status: 400 }
        )
      }
      
      throw new Error(`Failed to verify: ${response.status}`)
    }

    const result = await response.json()
    console.log('Verification successful:', result)

    // Now save the verified bank account as a payment method
    const supabase = createServerSupabaseClient()
    
    // Get tenant info
    console.log('🔍 Looking up tenant...')
    const { data: tenant, error: tenantError } = await supabase
      .from('tenants')
      .select('id')
      .eq('user_id', session.userId)
      .eq('moov_account_id', moovAccountId)
      .single()

    if (tenantError) {
      console.error('❌ Failed to find tenant:', tenantError)
      throw new Error('Failed to find tenant')
    }

    if (!tenant) {
      console.error('❌ No tenant found for user:', session.userId)
      throw new Error('No tenant found')
    }

    // Update the payment method to mark it as verified
    console.log('💾 Marking payment method as verified...')
    const { data: paymentMethod, error: pmError } = await supabase
      .from('payment_methods')
      .update({
        is_verified: true
      })
      .eq('tenant_id', tenant.id)
      .eq('moov_payment_method_id', bankAccountId)
      .select()
      .single()

    if (pmError) {
      console.error('❌ Failed to update payment method:', pmError)
      throw new Error('Failed to update payment method status')
    }

    if (!paymentMethod) {
      console.error('❌ Payment method not found:', { tenant_id: tenant.id, bankAccountId })
      throw new Error('Payment method not found')
    }

    console.log('✅ Payment method marked as verified:', paymentMethod)

    return NextResponse.json({ 
      success: true,
      verified: true,
      bankAccount: result,
      paymentMethod
    })

  } catch (error) {
    console.error('Micro-deposit verification error:', error)
    return NextResponse.json(
      { error: 'Failed to verify micro-deposits' },
      { status: 500 }
    )
  }
}
