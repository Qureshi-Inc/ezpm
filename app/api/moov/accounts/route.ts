import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { createServerSupabaseClient } from '@/lib/supabase'

// Create a new Moov account
export async function POST(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const body = await request.json()
    console.log('Creating Moov account via backend:', body)

    // Get OAuth token
    const tokenResponse = await fetch('https://api.moov.io/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${Buffer.from(`${process.env.MOOV_PUBLIC_KEY}:${process.env.MOOV_SECRET_KEY}`).toString('base64')}`
      },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        scope: [
          '/accounts.write',
          `/accounts/${process.env.MOOV_FACILITATOR_ACCOUNT_ID}/profile.read`,
          '/fed.read',
          '/profile-enrichment.read'
        ].join(' ')
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

    // Create account with Moov
    const accountResponse = await fetch('https://api.moov.io/accounts', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Origin': 'https://api.moov.io' // Set origin to Moov to avoid CORS issues
      },
      body: JSON.stringify(body)
    })

    if (!accountResponse.ok) {
      const errorData = await accountResponse.text()
      console.error('Moov account creation failed:', errorData)
      return NextResponse.json(
        { error: 'Failed to create account', details: errorData },
        { status: accountResponse.status }
      )
    }

    const account = await accountResponse.json()
    console.log('Moov account created successfully:', account.accountID)

    // Save account ID to database
    const supabase = createServerSupabaseClient()
    const { error: dbError } = await supabase
      .from('tenants')
      .update({ moov_account_id: account.accountID })
      .eq('user_id', session.userId)

    if (dbError) {
      console.error('Failed to save Moov account ID to database:', dbError)
      // Don't fail the whole request if DB update fails
    }

    return NextResponse.json(account)

  } catch (error: any) {
    console.error('Error creating Moov account:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    )
  }
}

// Request capabilities for an account
export async function PUT(request: NextRequest) {
  try {
    const session = await getSession()
    console.log('PUT /api/moov/accounts - Session check:', session ? 'Found' : 'Not found')
    
    // Make session optional for capabilities request since account was just created
    if (!session) {
      console.warn('No session found for capabilities request, proceeding anyway')
    }

    const { accountId, capabilities } = await request.json()
    console.log('Requesting capabilities for account:', accountId, capabilities)

    if (!process.env.MOOV_PUBLIC_KEY || !process.env.MOOV_SECRET_KEY) {
      console.error('Missing Moov credentials in environment variables')
      return NextResponse.json(
        { error: 'Server configuration error - missing Moov credentials' },
        { status: 500 }
      )
    }

    // Get OAuth token - use facilitator account scope for managing child accounts
    const tokenResponse = await fetch('https://api.moov.io/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${Buffer.from(`${process.env.MOOV_PUBLIC_KEY}:${process.env.MOOV_SECRET_KEY}`).toString('base64')}`
      },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        scope: `/accounts.write`  // Use general accounts.write scope
      })
    })

    if (!tokenResponse.ok) {
      const error = await tokenResponse.text()
      console.error('Failed to get Moov token for capabilities:', error)
      console.error('Token response status:', tokenResponse.status)
      return NextResponse.json(
        { error: 'Failed to authenticate with Moov', details: error },
        { status: 500 }
      )
    }

    const tokenData = await tokenResponse.json()
    const token = tokenData.access_token
    console.log('Got token for capabilities request')

    // Request capabilities
    const capabilitiesResponse = await fetch(
      `https://api.moov.io/accounts/${accountId}/capabilities`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'X-Account-Id': process.env.MOOV_FACILITATOR_ACCOUNT_ID || ''  // Act as facilitator
        },
        body: JSON.stringify({ capabilities })
      }
    )

    if (!capabilitiesResponse.ok) {
      const errorData = await capabilitiesResponse.text()
      console.error('Failed to request capabilities:', errorData)
      console.error('Capabilities response status:', capabilitiesResponse.status)
      return NextResponse.json(
        { error: 'Failed to request capabilities', details: errorData },
        { status: capabilitiesResponse.status }
      )
    }

    const result = await capabilitiesResponse.json()
    console.log('Capabilities requested successfully')
    return NextResponse.json(result)

  } catch (error: any) {
    console.error('Error requesting capabilities:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    )
  }
}
