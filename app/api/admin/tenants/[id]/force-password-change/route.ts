import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'
import { requireAdmin } from '@/lib/auth'

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Verify admin authentication
    await requireAdmin()
    
    const { id } = await params
    const supabase = createServerSupabaseClient()

    // Get the tenant to find the user_id
    const { data: tenant, error: tenantFetchError } = await supabase
      .from('tenants')
      .select('user_id, first_name, last_name')
      .eq('id', id)
      .single()

    if (tenantFetchError || !tenant) {
      return NextResponse.json(
        { error: 'Tenant not found' },
        { status: 404 }
      )
    }

    // Force password change by setting updated_at back to created_at
    // This will make the system think the password hasn't been changed since creation
    const { data: user, error: getUserError } = await supabase
      .from('users')
      .select('created_at')
      .eq('id', tenant.user_id)
      .single()

    if (getUserError || !user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      )
    }

    // Update the user's updated_at to match created_at
    const { error: updateError } = await supabase
      .from('users')
      .update({ updated_at: user.created_at })
      .eq('id', tenant.user_id)

    if (updateError) {
      console.error('Force password change error:', updateError)
      return NextResponse.json(
        { error: 'Failed to force password change' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      message: `${tenant.first_name} ${tenant.last_name} will be required to change their password on next login`
    })

  } catch (error) {
    console.error('Force password change error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
} 