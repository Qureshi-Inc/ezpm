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
    
    // Check if micro-deposits exist
    console.log('🔍 Checking if micro-deposits exist...')
    const checkResponse = await fetch(
      `${MOOV_DOMAIN}/accounts/${moovAccountId}/bank-accounts/${bankAccountId}/micro-deposits`,
      {
        method: 'GET',
        headers: {
          'Authorization': authHeader,
        }
      }
    )
    
    console.log('📊 Check response status:', checkResponse.status)
    
    if (checkResponse.status === 404) {
      console.log('📤 Micro-deposits not found, initiating them...')
      
      // Initiate micro-deposits
      const initiateResponse = await fetch(
        `${MOOV_DOMAIN}/accounts/${moovAccountId}/bank-accounts/${bankAccountId}/micro-deposits`,
        {
          method: 'POST',
          headers: {
            'Authorization': authHeader,
            'Content-Type': 'application/json',
          }
        }
      )
      
      console.log('📤 Initiate response status:', initiateResponse.status)
      
      if (!initiateResponse.ok) {
        const errorText = await initiateResponse.text()
        console.error('❌ Failed to initiate micro-deposits:', errorText)
        return NextResponse.json(
          { error: 'Failed to initiate micro-deposits. Please try again.' },
          { status: 500 }
        )
      }
      
      console.log('✅ Micro-deposits initiated successfully')
      return NextResponse.json({
        success: false,
        message: 'Micro-deposits have been sent to your bank account. Please wait 1-2 business days and try verification again.',
        initiated: true
      })
    }
    
    if (!checkResponse.ok) {
      const errorText = await checkResponse.text()
      console.error('❌ Error checking micro-deposits. Status:', checkResponse.status, 'Error:', errorText)
      
      // Log response headers for debugging
      console.log('📋 Response headers:', Object.fromEntries(checkResponse.headers.entries()))
      
      // If it's a 403 or other auth error, try initiating anyway
      if (checkResponse.status === 403 || checkResponse.status === 401) {
        console.log('🔄 Auth error checking micro-deposits, attempting to initiate...')
        
        const initiateResponse = await fetch(
          `${MOOV_DOMAIN}/accounts/${moovAccountId}/bank-accounts/${bankAccountId}/micro-deposits`,
          {
            method: 'POST',
            headers: {
              'Authorization': authHeader,
              'Content-Type': 'application/json',
            }
          }
        )
        
        console.log('📤 Initiate response status:', initiateResponse.status)
        
        if (initiateResponse.ok) {
          console.log('✅ Micro-deposits initiated successfully (after auth error)')
          return NextResponse.json({
            success: false,
            message: 'Micro-deposits have been sent to your bank account. Please wait 1-2 business days and try verification again.',
            initiated: true
          })
        } else {
          const initiateErrorText = await initiateResponse.text()
          console.error('❌ Failed to initiate after auth error:', initiateErrorText)
        }
      }
      
      return NextResponse.json(
        { error: `Error checking micro-deposit status: ${checkResponse.status} - ${errorText}` },
        { status: 500 }
      )
    }
    
    console.log('✅ Micro-deposits exist, proceeding with verification...')
    
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
    const { data: tenant } = await supabase
      .from('tenants')
      .select('id')
      .eq('user_id', session.userId)
      .eq('moov_account_id', moovAccountId)
      .single()

    if (tenant) {
      // Update the payment method to mark it as verified
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
        console.error('Failed to update payment method:', pmError)
        // Don't fail the whole request if updating fails
      } else {
        console.log('Payment method marked as verified:', paymentMethod)
      }
    }

    return NextResponse.json({ 
      success: true,
      verified: true,
      bankAccount: result
    })

  } catch (error) {
    console.error('Micro-deposit verification error:', error)
    return NextResponse.json(
      { error: 'Failed to verify micro-deposits' },
      { status: 500 }
    )
  }
}
