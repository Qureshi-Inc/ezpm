import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { createServerSupabaseClient } from '@/lib/supabase'

export async function GET(request: NextRequest) {
  try {
    const session = await getSession()
    
    if (!session) {
      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401 }
      )
    }

    const supabase = createServerSupabaseClient()

    // Get user details
    const { data: user, error } = await supabase
      .from('users')
      .select('id, email, role, created_at, updated_at')
      .eq('id', session.userId)
      .single()

    if (error || !user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
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

    return NextResponse.json({
      id: user.id,
      email: user.email,
      role: user.role,
      needsPasswordChange
    })

  } catch (error) {
    console.error('Get user error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
} 