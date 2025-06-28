import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { generateMoovToken } from '@/lib/moov-server'

export async function POST(request: NextRequest) {
  try {
    console.log('Moov token request received')
    
    const session = await getSession()
    console.log('Session:', session ? { role: session.role, userId: session.userId } : 'No session')
    
    if (!session || session.role !== 'tenant') {
      console.log('Unauthorized access attempt')
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const { scopes } = await request.json()
    console.log('Requested scopes:', scopes)

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