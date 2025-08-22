import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'

export async function POST(request: NextRequest) {
  try {
    const session = await getSession()
    
    if (!session || session.role !== 'tenant') {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const { scopes, accountId } = await request.json()

    if (!scopes || !Array.isArray(scopes)) {
      return NextResponse.json(
        { error: 'Scopes array is required' },
        { status: 400 }
      )
    }

    // Generate OAuth token with the requested scopes
    const tokenResponse = await fetch(`${process.env.MOOV_DOMAIN}/oauth2/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: process.env.MOOV_PUBLIC_KEY!,
        client_secret: process.env.MOOV_SECRET_KEY!,
        scope: scopes.join(' ')
      })
    })

    if (!tokenResponse.ok) {
      const error = await tokenResponse.text()
      console.error('Failed to generate Moov token:', error)
      return NextResponse.json(
        { error: 'Failed to generate token' },
        { status: 500 }
      )
    }

    const tokenData = await tokenResponse.json()

    return NextResponse.json({ 
      token: tokenData.access_token,
      expiresIn: tokenData.expires_in,
      scope: tokenData.scope
    })
  } catch (error) {
    console.error('Failed to generate Moov onboarding token:', error)
    return NextResponse.json(
      { error: 'Failed to generate token' },
      { status: 500 }
    )
  }
}
