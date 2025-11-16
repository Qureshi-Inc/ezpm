import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'

export async function GET(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const stage = request.nextUrl.searchParams.get('stage')
    const facilitatorAccountId = request.nextUrl.searchParams.get('facilitatorAccountId')
    const accountId = request.nextUrl.searchParams.get('accountId')

    if (!stage || !facilitatorAccountId) {
      return NextResponse.json({
        error: 'Missing required parameters: stage, facilitatorAccountId'
      }, { status: 400 })
    }

    let scopes: string[] = []

    if (stage === 'initial') {
      // Initial scopes for account creation
      scopes = [
        '/accounts.write',
        `/accounts/${facilitatorAccountId}/profile.read`,
        '/fed.read',
        '/profile-enrichment.read'
      ]
    } else if (stage === 'account' && accountId) {
      // Account-specific scopes after account creation
      scopes = [
        // Keep initial scopes
        '/accounts.write',
        `/accounts/${facilitatorAccountId}/profile.read`,
        '/fed.read',
        '/profile-enrichment.read',
        // Add account-specific scopes
        `/accounts/${accountId}/bank-accounts.read`,
        `/accounts/${accountId}/bank-accounts.write`,
        `/accounts/${accountId}/capabilities.read`,
        `/accounts/${accountId}/capabilities.write`,
        `/accounts/${accountId}/cards.read`,
        `/accounts/${accountId}/cards.write`,
        `/accounts/${accountId}/profile.read`,
        `/accounts/${accountId}/profile.write`,
        `/accounts/${accountId}/representatives.read`,
        `/accounts/${accountId}/representatives.write`
      ]
    } else {
      return NextResponse.json({
        error: 'Invalid stage or missing accountId for account stage'
      }, { status: 400 })
    }

    const tokenScope = scopes.join(' ')

    console.log(`Requesting ${stage} onboarding token with scope: ${tokenScope}`)
    console.log('For facilitator:', facilitatorAccountId)
    if (accountId) {
      console.log('For account:', accountId)
    }

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
      console.error('Failed to get Moov onboarding token:', error)
      return NextResponse.json(
        { error: 'Failed to authenticate with Moov for onboarding' },
        { status: 500 }
      )
    }

    const tokenData = await tokenResponse.json()

    console.log(`${stage} onboarding token generated successfully`)
    console.log('Token scopes:', tokenData.scope)

    return NextResponse.json({ token: tokenData.access_token })
  } catch (error) {
    console.error('Error generating onboarding token:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}