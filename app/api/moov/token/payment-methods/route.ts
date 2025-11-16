import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const { accountId } = await request.json()

    if (!accountId) {
      return NextResponse.json(
        { error: 'Account ID is required' },
        { status: 400 }
      )
    }

    // Validate environment variables (same as other endpoints)
    const facilitatorId = process.env.NEXT_PUBLIC_MOOV_FACILITATOR_ACCOUNT_ID
    if (!facilitatorId) {
      console.error('Missing NEXT_PUBLIC_MOOV_FACILITATOR_ACCOUNT_ID')
      return NextResponse.json(
        { error: 'Server configuration error' },
        { status: 500 }
      )
    }

    // Generate OAuth token with payment methods scopes for Moov Drops
    const tokenScope = [
      '/fed.read',
      `/accounts/${accountId}/cards.read`,
      `/accounts/${accountId}/cards.write`,
      `/accounts/${accountId}/bank-accounts.read`,
      `/accounts/${accountId}/bank-accounts.write`
    ].join(' ')

    console.log('Requesting payment methods token with scope:', tokenScope)
    console.log('For account:', accountId)

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
      console.error('Failed to get Moov payment methods token:', error)
      console.error('Token response status:', tokenResponse.status)
      return NextResponse.json(
        { error: 'Failed to authenticate with Moov for payment methods', details: error },
        { status: 500 }
      )
    }

    const tokenData = await tokenResponse.json()
    const token = tokenData.access_token

    console.log('Payment methods token generated successfully')
    console.log('Token scopes:', tokenData.scope)

    // IMPORTANT: Only return the JWT token, never API keys
    return NextResponse.json({
      token,
      accountId
    })

  } catch (error) {
    console.error('Error generating payment methods token:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}