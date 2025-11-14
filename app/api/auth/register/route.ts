import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { createServerSupabaseClient } from '@/lib/supabase'
import { cookies } from 'next/headers'

export async function POST(request: NextRequest) {
  try {
    const { email, password, firstName, lastName, phone, isAdmin } = await request.json()

    console.log('Registration attempt:', { email, firstName, lastName, isAdmin })

    if (!email || !password || !firstName || !lastName) {
      console.log('Missing required fields')
      return NextResponse.json(
        { error: 'All fields are required' },
        { status: 400 }
      )
    }

    const supabase = createServerSupabaseClient()

    // Check if user already exists
    const { data: existingUser, error: checkError } = await supabase
      .from('users')
      .select('id')
      .eq('email', email)
      .single()

    console.log('Existing user check:', { existingUser: !!existingUser, checkError: checkError?.message })

    if (existingUser) {
      return NextResponse.json(
        { error: 'User already exists' },
        { status: 400 }
      )
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10)
    console.log('Password hashed, hash length:', passwordHash.length)

    // Determine role - allow admin creation for testing
    const role = isAdmin ? 'admin' : 'tenant'

    // Create user
    const { data: newUser, error: userError } = await supabase
      .from('users')
      .insert({
        email,
        password_hash: passwordHash,
        role
      })
      .select()
      .single()

    console.log('User creation result:', {
      success: !!newUser,
      error: userError?.message,
      userId: newUser?.id,
      userRole: newUser?.role
    })

    if (userError || !newUser) {
      console.error('Failed to create user:', userError)
      throw new Error(`Failed to create user: ${userError?.message || 'Unknown error'}`)
    }

    // Create tenant record only for non-admin users
    if (role === 'tenant') {
      const { error: tenantError } = await supabase
        .from('tenants')
        .insert({
          user_id: newUser.id,
          first_name: firstName,
          last_name: lastName,
          phone: phone || null
        })

      console.log('Tenant creation result:', { error: tenantError?.message })

      if (tenantError) {
        console.error('Failed to create tenant profile:', tenantError)
        // Rollback user creation
        await supabase.from('users').delete().eq('id', newUser.id)
        throw new Error(`Failed to create tenant profile: ${tenantError.message}`)
      }
    } else {
      console.log('Skipping tenant profile creation for admin user')
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