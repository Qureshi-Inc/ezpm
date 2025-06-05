import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { createServerSupabaseClient } from '@/lib/supabase'

export async function GET(request: NextRequest) {
  try {
    await requireAdmin()
    
    const supabase = createServerSupabaseClient()

    // Get all tenants with detailed info
    const { data: tenants, error: tenantsError } = await supabase
      .from('tenants')
      .select(`
        id,
        first_name,
        last_name,
        payment_due_day,
        property_id,
        property:properties(
          id,
          address,
          rent_amount
        ),
        user:users(
          email
        )
      `)

    if (tenantsError) {
      throw new Error(`Failed to fetch tenants: ${tenantsError.message}`)
    }

    // Also get existing payments for each tenant
    const tenantsWithPayments = []
    
    for (const tenant of tenants || []) {
      const { data: payments } = await supabase
        .from('payments')
        .select('id, due_date, status, amount')
        .eq('tenant_id', tenant.id)
        .order('due_date', { ascending: false })
        .limit(5)

      tenantsWithPayments.push({
        ...tenant,
        recentPayments: payments || []
      })
    }

    return NextResponse.json({
      success: true,
      tenants: tenantsWithPayments,
      currentDate: new Date().toISOString().split('T')[0]
    })

  } catch (error) {
    console.error('Debug tenants error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
} 