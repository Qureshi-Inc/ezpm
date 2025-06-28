import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { generateMoovToken } from '@/lib/moov-server'

export async function POST(request: NextRequest) {
  try {
    const session = await getSession()
    
    if (!session || session.role !== 'tenant') {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const { scopes } = await request.json()

    if (!scopes || !Array.isArray(scopes)) {
      return NextResponse.json(
        { error: 'Scopes array is required' },
        { status: 400 }
      )
    }

    // Generate Moov token with requested scopes
    const token = await generateMoovToken(scopes)

    return NextResponse.json({ token })
  } catch (error) {
    console.error('Failed to generate Moov token:', error)
    return NextResponse.json(
      { error: 'Failed to generate token' },
      { status: 500 }
    )
  }
} 