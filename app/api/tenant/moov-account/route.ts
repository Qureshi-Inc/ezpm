import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { createServerSupabaseClient } from '@/lib/supabase'

export async function GET(request: NextRequest) {
  try {
    const session = await getSession()
    
    if (!session || session.role !== 'tenant') {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const supabase = createServerSupabaseClient()

    // Get the current tenant with their Moov account ID
    const { data: tenant, error: tenantError } = await supabase
      .from('tenants')
      .select('id, moov_account_id')
      .eq('user_id', session.userId)
      .single()

    if (tenantError || !tenant) {
      return NextResponse.json(
        { error: 'Tenant not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({ 
      success: true,
      moovAccountId: tenant.moov_account_id
    })
  } catch (error) {
    console.error('Failed to get Moov account:', error)
    return NextResponse.json(
      { error: 'Failed to get Moov account' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSession()
    
    if (!session || session.role !== 'tenant') {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const { moovAccountId } = await request.json()

    if (!moovAccountId) {
      return NextResponse.json(
        { error: 'Moov account ID is required' },
        { status: 400 }
      )
    }

    const supabase = createServerSupabaseClient()

    // Get the current tenant
    const { data: tenant, error: tenantError } = await supabase
      .from('tenants')
      .select('id')
      .eq('user_id', session.userId)
      .single()

    if (tenantError || !tenant) {
      return NextResponse.json(
        { error: 'Tenant not found' },
        { status: 404 }
      )
    }

    // Update the tenant with the Moov account ID
    const { error: updateError } = await supabase
      .from('tenants')
      .update({ moov_account_id: moovAccountId })
      .eq('id', tenant.id)

    if (updateError) {
      console.error('Failed to save Moov account ID:', updateError)
      return NextResponse.json(
        { error: 'Failed to save Moov account' },
        { status: 500 }
      )
    }

    return NextResponse.json({ 
      success: true,
      moovAccountId 
    })
  } catch (error) {
    console.error('Failed to save Moov account:', error)
    return NextResponse.json(
      { error: 'Failed to save Moov account' },
      { status: 500 }
    )
  }
}
