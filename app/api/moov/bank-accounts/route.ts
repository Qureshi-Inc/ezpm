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

    const facilitatorId = process.env.NEXT_PUBLIC_MOOV_FACILITATOR_ACCOUNT_ID || process.env.MOOV_ACCOUNT_ID
    
    if (!process.env.MOOV_PUBLIC_KEY || !process.env.MOOV_SECRET_KEY || !facilitatorId) {
      console.error('Missing Moov configuration in environment variables')
      console.error('MOOV_PUBLIC_KEY:', process.env.MOOV_PUBLIC_KEY ? 'Set' : 'Missing')
      console.error('MOOV_SECRET_KEY:', process.env.MOOV_SECRET_KEY ? 'Set' : 'Missing')  
      console.error('MOOV_FACILITATOR_ACCOUNT_ID:', facilitatorId || 'Missing')
      return NextResponse.json(
        { error: 'Server configuration error - missing Moov credentials or facilitator ID' },
        { status: 500 }
      )
    }

    // Get OAuth token with bank account scopes
    // Use tenant-specific bank-accounts.write scope for the child account
    const tokenScope = `/accounts/${accountId}/bank-accounts.write`
    console.log('Requesting OAuth token with scope:', tokenScope)
    console.log('Using facilitator ID:', facilitatorId)
    console.log('Environment check:', {
      hasMoovPublicKey: !!process.env.MOOV_PUBLIC_KEY,
      hasMoovSecretKey: !!process.env.MOOV_SECRET_KEY,
      hasNextPublicFacilitatorId: !!process.env.NEXT_PUBLIC_MOOV_FACILITATOR_ACCOUNT_ID,
      hasMoovAccountId: !!process.env.MOOV_ACCOUNT_ID,
      facilitatorIdValue: facilitatorId
    })

    const tokenResponse = await fetch('https://api.moov.io/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${Buffer.from(`${process.env.MOOV_PUBLIC_KEY}:${process.env.MOOV_SECRET_KEY}`).toString('base64')}`
      },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        scope: tokenScope
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
    console.log('Token info:', {
      tokenType: tokenData.token_type,
      expiresIn: tokenData.expires_in,
      scope: tokenData.scope,
      tokenPrefix: token.substring(0, 20) + '...'
    })

    // Verify the token has the correct scope
    const expectedScope = `/accounts/${accountId}/bank-accounts.write`
    const hasCorrectScope = tokenData.scope && tokenData.scope.includes(expectedScope)
    console.log('Token scope verification:', {
      expectedScope,
      receivedScope: tokenData.scope,
      hasCorrectScope
    })

    // Prepare headers for debugging
    const headers = {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Origin': 'https://api.moov.io', // Match account creation pattern
      'X-Wait-For': 'payment-method',
      'X-Account-Id': facilitatorId  // Act as facilitator for child account
    }
    console.log('Bank account request headers:', JSON.stringify(headers, null, 2))
    console.log('Request URL:', `https://api.moov.io/accounts/${accountId}/bank-accounts`)

    // Skip capability check - not needed for bank account operations in sandbox
    // The /accounts/{accountId}/bank-accounts.write scope is sufficient

    // Link bank account with Moov
    const bankResponse = await fetch(
      `https://api.moov.io/accounts/${accountId}/bank-accounts`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify(bankAccountData)
      }
    )

    if (!bankResponse.ok) {
      const errorData = await bankResponse.text()
      console.error('Failed to link bank account:')
      console.error('Status:', bankResponse.status)
      console.error('Body:', errorData || '(empty response)')
      console.error('Headers:', Object.fromEntries(bankResponse.headers.entries()))
      console.error('Request data:', JSON.stringify(bankAccountData, null, 2))
      console.error('Account ID:', accountId)
      console.error('Facilitator ID:', facilitatorId)

      // Parse Moov error response
      let moovError = null
      let errorMessage = 'Failed to link bank account'

      try {
        if (errorData && errorData.trim().startsWith('{')) {
          moovError = JSON.parse(errorData)
          console.error('Parsed Moov error:', JSON.stringify(moovError, null, 2))

          // Use Moov's error message if available
          if (moovError.error) {
            errorMessage = moovError.error
          } else if (moovError.message) {
            errorMessage = moovError.message
          } else if (moovError.description) {
            errorMessage = moovError.description
          }
        }
      } catch (e) {
        console.error('Could not parse error response as JSON')
      }

      // Fallback messages for common status codes
      if (!moovError) {
        if (bankResponse.status === 401) {
          errorMessage = 'Authentication failed. Please check your account configuration.'
        } else if (bankResponse.status === 403) {
          errorMessage = 'Account capabilities not yet approved. Please wait a few minutes and try again.'
        } else if (bankResponse.status === 422) {
          errorMessage = 'Invalid bank account information. Please check your account number and routing number.'
        }
      }

      return NextResponse.json(
        {
          error: errorMessage,
          moovError: moovError,
          status: bankResponse.status
        },
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
            'Accept': 'application/json',
            'x-moov-version': 'v2024.01.00'
            // No X-Account-Id per Moov docs - may be causing 401 for micro-deposits
          }
        }
      )

      const microDepositResponseText = await microDepositResponse.text()
      console.log('Micro-deposit initiation response:', {
        status: microDepositResponse.status,
        statusText: microDepositResponse.statusText,
        body: microDepositResponseText
      })

      if (!microDepositResponse.ok) {
        console.warn('Failed to initiate micro-deposits (will need manual initiation)')
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

    // Get OAuth token for micro-deposit verification
    // Use tenant-specific bank-accounts.write scope
    const tokenScope = `/accounts/${accountId}/bank-accounts.write`
    console.log('Requesting OAuth token for verification with scope:', tokenScope)
    
    const tokenResponse = await fetch('https://api.moov.io/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${Buffer.from(`${process.env.MOOV_PUBLIC_KEY}:${process.env.MOOV_SECRET_KEY}`).toString('base64')}`
      },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        scope: tokenScope
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
          'Accept': 'application/json',
          'x-moov-version': 'v2024.01.00'
          // No X-Account-Id per Moov docs - using facilitator ID may cause 401
        },
        body: JSON.stringify({ amounts })
      }
    )

    if (!verifyResponse.ok) {
      const errorData = await verifyResponse.text()
      console.error('Moov verification failed:')
      console.error('Status:', verifyResponse.status)
      console.error('StatusText:', verifyResponse.statusText)
      console.error('Body:', errorData)
      console.error('Amounts sent:', amounts)

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
