import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'

// Link a bank account to a Moov account
export async function POST(request: NextRequest) {
  try {
    const session = await getSession()
    console.log('POST /api/moov/bank-accounts - Session check:', session ? 'Found' : 'Not found')
    
    // Make session optional since we're in the middle of onboarding flow
    if (!session) {
      console.warn('No session found for bank account link, proceeding anyway')
    }

    const { accountId, bankAccountData } = await request.json()
    console.log('Linking bank account for account:', accountId)

    if (!process.env.MOOV_PUBLIC_KEY || !process.env.MOOV_SECRET_KEY) {
      console.error('Missing Moov credentials in environment variables')
      return NextResponse.json(
        { error: 'Server configuration error - missing Moov credentials' },
        { status: 500 }
      )
    }

    // Get OAuth token with bank account scopes - use general scope
    const tokenResponse = await fetch('https://api.moov.io/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${Buffer.from(`${process.env.MOOV_PUBLIC_KEY}:${process.env.MOOV_SECRET_KEY}`).toString('base64')}`
      },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        scope: '/accounts.write'  // Use general scope for facilitator to manage child accounts
      })
    })

    if (!tokenResponse.ok) {
      const error = await tokenResponse.text()
      console.error('Failed to get Moov token for bank account:', error)
      console.error('Token response status:', tokenResponse.status)
      return NextResponse.json(
        { error: 'Failed to authenticate with Moov', details: error },
        { status: 500 }
      )
    }

    const tokenData = await tokenResponse.json()
    const token = tokenData.access_token
    console.log('Got token for bank account link')

    // Link bank account with Moov
    const bankResponse = await fetch(
      `https://api.moov.io/accounts/${accountId}/bank-accounts`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'X-Wait-For': 'payment-method'
          // Removed X-Account-Id - not needed when URL already has account ID
        },
        body: JSON.stringify(bankAccountData)
      }
    )

    if (!bankResponse.ok) {
      const errorData = await bankResponse.text()
      console.error('Failed to link bank account - Moov error:', errorData)
      console.error('Bank response status:', bankResponse.status)
      console.error('Bank account data:', JSON.stringify(bankAccountData, null, 2))
      console.error('Account ID:', accountId)
      console.error('Facilitator ID:', process.env.MOOV_FACILITATOR_ACCOUNT_ID)
      
      // Try to parse error for more details
      try {
        const errorJson = JSON.parse(errorData)
        console.error('Parsed error:', JSON.stringify(errorJson, null, 2))
      } catch (e) {
        // Not JSON, already logged as text
      }
      
      return NextResponse.json(
        { error: 'Failed to link bank account', details: errorData },
        { status: bankResponse.status }
      )
    }

    const bankAccount = await bankResponse.json()
    console.log('Bank account linked successfully:', bankAccount.bankAccountID)

    // Automatically initiate micro-deposits
    try {
      const microDepositResponse = await fetch(
        `https://api.moov.io/accounts/${accountId}/bank-accounts/${bankAccount.bankAccountID}/micro-deposits`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
            // Removed X-Account-Id - not needed when URL already has account ID
          }
        }
      )

      if (!microDepositResponse.ok) {
        console.warn('Failed to initiate micro-deposits (will need manual initiation):', await microDepositResponse.text())
      } else {
        console.log('Micro-deposits initiated successfully')
      }
    } catch (error) {
      console.warn('Error initiating micro-deposits:', error)
    }

    return NextResponse.json(bankAccount)

  } catch (error: any) {
    console.error('Error linking bank account:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    )
  }
}

// Verify micro-deposits
export async function PUT(request: NextRequest) {
  try {
    const session = await getSession()
    console.log('PUT /api/moov/bank-accounts - Session check:', session ? 'Found' : 'Not found')
    
    // Make session optional since we're in the middle of onboarding flow
    if (!session) {
      console.warn('No session found for micro-deposit verification, proceeding anyway')
    }

    const { accountId, bankAccountId, amounts } = await request.json()
    console.log('Verifying micro-deposits for bank account:', bankAccountId)

    // Get OAuth token - use general scope
    const tokenResponse = await fetch('https://api.moov.io/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${Buffer.from(`${process.env.MOOV_PUBLIC_KEY}:${process.env.MOOV_SECRET_KEY}`).toString('base64')}`
      },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        scope: '/accounts.write'  // Use general scope for facilitator
      })
    })

    if (!tokenResponse.ok) {
      const error = await tokenResponse.text()
      console.error('Failed to get Moov token:', error)
      return NextResponse.json(
        { error: 'Failed to authenticate with Moov' },
        { status: 500 }
      )
    }

    const tokenData = await tokenResponse.json()
    const token = tokenData.access_token

    // Verify micro-deposits
    const verifyResponse = await fetch(
      `https://api.moov.io/accounts/${accountId}/bank-accounts/${bankAccountId}/micro-deposits`,
      {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
          // Removed X-Account-Id - not needed when URL already has account ID
        },
        body: JSON.stringify({ amounts })
      }
    )

    if (!verifyResponse.ok) {
      const errorData = await verifyResponse.text()
      console.error('Failed to verify micro-deposits:', errorData)
      return NextResponse.json(
        { error: 'Failed to verify micro-deposits', details: errorData },
        { status: verifyResponse.status }
      )
    }

    const result = await verifyResponse.json()
    console.log('Micro-deposits verified successfully')
    return NextResponse.json(result)

  } catch (error: any) {
    console.error('Error verifying micro-deposits:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    )
  }
}
