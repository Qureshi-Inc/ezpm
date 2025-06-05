import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { createServerSupabaseClient } from '@/lib/supabase'
import { cookies } from 'next/headers'

export async function POST(request: NextRequest) {
  try {
    const { email, password, firstName, lastName, phone } = await request.json()

    if (!email || !password || !firstName || !lastName) {
      return NextResponse.json(
        { error: 'All fields are required' },
        { status: 400 }
      )
    }

    const supabase = createServerSupabaseClient()

    // Check if user already exists
    const { data: existingUser } = await supabase
      .from('users')
      .select('id')
      .eq('email', email)
      .single()

    if (existingUser) {
      return NextResponse.json(
        { error: 'User already exists' },
        { status: 400 }
      )
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10)

    // Create user
    const { data: newUser, error: userError } = await supabase
      .from('users')
      .insert({
        email,
        password_hash: passwordHash,
        role: 'tenant'
      })
      .select()
      .single()

    if (userError || !newUser) {
      throw new Error('Failed to create user')
    }

    // Create tenant record
    const { error: tenantError } = await supabase
      .from('tenants')
      .insert({
        user_id: newUser.id,
        first_name: firstName,
        last_name: lastName,
        phone: phone || null
      })

    if (tenantError) {
      // Rollback user creation
      await supabase.from('users').delete().eq('id', newUser.id)
      throw new Error('Failed to create tenant profile')
    }

    // Create session token
    const sessionToken = Buffer.from(JSON.stringify({
      userId: newUser.id,
      email: newUser.email,
      role: newUser.role
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
      id: newUser.id,
      email: newUser.email,
      role: newUser.role
    })
  } catch (error) {
    console.error('Registration error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
} 