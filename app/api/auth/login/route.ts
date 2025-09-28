import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { createServerSupabaseClient } from '@/lib/supabase'
import { cookies } from 'next/headers'

export async function POST(request: NextRequest) {
  try {
    const { email, password } = await request.json()

    console.log('Login attempt:', { email, passwordProvided: !!password })

    if (!email || !password) {
      console.log('Missing email or password')
      return NextResponse.json(
        { error: 'Email and password are required' },
        { status: 400 }
      )
    }

    const supabase = createServerSupabaseClient()

    // Fetch user from database
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('*')
      .eq('email', email)
      .single()

    console.log('Database query result:', {
      userFound: !!user,
      error: userError?.message,
      userId: user?.id,
      userRole: user?.role,
      hasPasswordHash: !!user?.password_hash
    })

    if (userError || !user) {
      console.log('User not found or database error:', userError)
      return NextResponse.json(
        { error: 'Invalid credentials' },
        { status: 401 }
      )
    }

    // Verify password
    const passwordMatch = await bcrypt.compare(password, user.password_hash)

    console.log('Password verification:', {
      passwordMatch,
      passwordHashPrefix: user.password_hash?.substring(0, 10),
      passwordLength: password.length
    })

    if (!passwordMatch) {
      console.log('Password mismatch - login failed')
      return NextResponse.json(
        { error: 'Invalid credentials' },
        { status: 401 }
      )
    }

    // Check if password needs to be changed
    // Use a reasonable window: 2 hours for newly created accounts
    const createdAt = new Date(user.created_at)
    const updatedAt = new Date(user.updated_at)
    const timeDiff = Math.abs(updatedAt.getTime() - createdAt.getTime())
    
    // Consider it a temporary password if:
    // 1. Account was created recently (within 2 hours), AND
    // 2. Password hasn't been updated (timestamps are very close)
    const accountAge = Date.now() - createdAt.getTime()
    const isNewAccount = accountAge < 2 * 60 * 60 * 1000 // 2 hours
    const passwordNotUpdated = timeDiff < 60000 // 1 minute difference between created and updated
    const needsPasswordChange = isNewAccount && passwordNotUpdated
    
    // Debug logging to understand what's happening
    console.log('Password change check:', {
      email: user.email,
      createdAt: createdAt.toISOString(),
      updatedAt: updatedAt.toISOString(),
      timeDiff: timeDiff,
      accountAge: accountAge,
      isNewAccount: isNewAccount,
      passwordNotUpdated: passwordNotUpdated,
      needsPasswordChange
    })

    // Create session token (in production, use JWT or similar)
    const sessionToken = Buffer.from(JSON.stringify({
      userId: user.id,
      email: user.email,
      role: user.role
    })).toString('base64')

    // Set session cookie
    const cookieStore = await cookies()
    cookieStore.set('session', sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7, // 7 days
      path: '/'
    })

    return NextResponse.json({
      id: user.id,
      email: user.email,
      role: user.role,
      needsPasswordChange
    })
  } catch (error) {
    console.error('Login error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
} 