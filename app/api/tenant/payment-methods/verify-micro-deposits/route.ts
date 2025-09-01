import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { createServerSupabaseClient } from '@/lib/supabase'

const MOOV_DOMAIN = process.env.MOOV_DOMAIN || 'https://api.moov.io'
const MOOV_PUBLIC_KEY = process.env.MOOV_PUBLIC_KEY
const MOOV_SECRET_KEY = process.env.MOOV_SECRET_KEY
const MOOV_ACCOUNT_ID = process.env.MOOV_ACCOUNT_ID // Facilitator account ID

// Use OAuth Bearer token for authentication with facilitator pattern
async function getAuthHeader(accountId?: string) {
  try {
    // Use wildcard scopes for facilitator to operate on all connected accounts
    const scopes = [
      '/accounts/**',
      '/bank-accounts/**', 
      '/payment-methods/**',
      '/capabilities/**'
    ].join(' ')
    
    const response = await fetch(`${MOOV_DOMAIN}/oauth2/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: MOOV_PUBLIC_KEY!,
        client_secret: MOOV_SECRET_KEY!,
        scope: scopes
      })
    })

    if (!response.ok) {
      console.error('Failed to get OAuth token:', response.status, response.statusText)
      throw new Error('Failed to authenticate with Moov')
    }

    const data = await response.json()
    return `Bearer ${data.access_token}`
  } catch (error) {
    console.error('Auth error:', error)
    throw error
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session || session.role !== 'tenant') {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const { moovAccountId, bankAccountId, amounts } = await request.json()

    if (!moovAccountId || !bankAccountId || !amounts || amounts.length !== 2) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    console.log('Verifying micro-deposits:', {
      moovAccountId,
      bankAccountId,
      amounts
    })

    // First check if micro-deposits exist, if not initiate them
    const authHeader = await getAuthHeader(moovAccountId)
    
    // Check if micro-deposits exist
    console.log('Checking if micro-deposits exist...')
    const checkResponse = await fetch(
      `${MOOV_DOMAIN}/accounts/${moovAccountId}/bank-accounts/${bankAccountId}/micro-deposits`,
      {
        method: 'GET',
        headers: {
          'Authorization': authHeader,
        }
      }
    )
    
    console.log('Check response status:', checkResponse.status)
    
    // Handle different response statuses
    if (checkResponse.status === 401 || checkResponse.status === 403) {
      console.error('Authorization error checking micro-deposits')
      return NextResponse.json(
        { error: 'Authorization error. Please try again or contact support.' },
        { status: 401 }
      )
    }
    
    // If micro-deposits don't exist (404) or we can't check them, initiate them
    if (checkResponse.status === 404 || !checkResponse.ok) {
      console.log('Micro-deposits not found or error checking, initiating them...')
      
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
      
      if (initiateResponse.status === 409) {
        // 409 means micro-deposits already exist
        console.log('Micro-deposits already exist (409 response)')
      } else if (!initiateResponse.ok) {
        const errorText = await initiateResponse.text()
        console.error('Failed to initiate micro-deposits:', errorText)
        return NextResponse.json(
          { error: 'Failed to initiate micro-deposits. Please try again.' },
          { status: 500 }
        )
      } else {
        console.log('Micro-deposits initiated successfully')
      }
      
      return NextResponse.json({
        success: false,
        message: 'Micro-deposits have been initiated. Please check your bank account in 1-2 business days.',
        initiated: true
      })
    }
    
    // If we get here, micro-deposits exist, so we can verify them
    console.log('Micro-deposits exist, proceeding with verification...')
    
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
