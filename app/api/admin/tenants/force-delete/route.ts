import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { createServerSupabaseClient } from '@/lib/supabase'

export async function POST(request: NextRequest) {
  try {
    await requireAdmin()
    
    const { tenantId, confirmPhrase } = await request.json()

    // Require confirmation phrase for safety
    if (confirmPhrase !== 'DELETE_ALL_DATA') {
      return NextResponse.json(
        { error: 'Invalid confirmation phrase. Use "DELETE_ALL_DATA" to confirm.' },
        { status: 400 }
      )
    }

    if (!tenantId) {
      return NextResponse.json(
        { error: 'Tenant ID is required' },
        { status: 400 }
      )
    }

    const supabase = createServerSupabaseClient()

    // Get tenant details
    const { data: tenant, error: tenantError } = await supabase
      .from('tenants')
      .select('user_id, first_name, last_name')
      .eq('id', tenantId)
      .single()

    if (tenantError || !tenant) {
      return NextResponse.json(
        { error: 'Tenant not found' },
        { status: 404 }
      )
    }

    console.log(`🗑️ FORCE DELETE: Starting complete deletion of tenant ${tenant.first_name} ${tenant.last_name} (${tenantId})`)

    // Delete all associated data in dependency order
    const deletionSteps = []

    // 1. Delete auto_payments
    const { error: autoPayError } = await supabase
      .from('auto_payments')
      .delete()
      .eq('tenant_id', tenantId)
    
    if (autoPayError) {
      deletionSteps.push(`❌ Auto payments: ${autoPayError.message}`)
    } else {
      deletionSteps.push('✅ Auto payments deleted')
    }

    // 2. Delete payment_methods  
    const { error: pmError } = await supabase
      .from('payment_methods')
      .delete()
      .eq('tenant_id', tenantId)
    
    if (pmError) {
      deletionSteps.push(`❌ Payment methods: ${pmError.message}`)
    } else {
      deletionSteps.push('✅ Payment methods deleted')
    }

    // 3. Delete payments
    const { error: paymentsError } = await supabase
      .from('payments')
      .delete()
      .eq('tenant_id', tenantId)
    
    if (paymentsError) {
      deletionSteps.push(`❌ Payments: ${paymentsError.message}`)
    } else {
      deletionSteps.push('✅ Payments deleted')
    }

    // 4. Delete tenant
    const { error: tenantDeleteError } = await supabase
      .from('tenants')
      .delete()
      .eq('id', tenantId)

    if (tenantDeleteError) {
      deletionSteps.push(`❌ Tenant: ${tenantDeleteError.message}`)
    } else {
      deletionSteps.push('✅ Tenant deleted')
    }

    // 5. Delete user account
    const { error: userDeleteError } = await supabase
      .from('users')
      .delete()
      .eq('id', tenant.user_id)

    if (userDeleteError) {
      deletionSteps.push(`❌ User account: ${userDeleteError.message}`)
    } else {
      deletionSteps.push('✅ User account deleted')
    }

    console.log('🗑️ FORCE DELETE COMPLETE:')
    deletionSteps.forEach(step => console.log(`  ${step}`))

    return NextResponse.json({
      success: true,
      message: `Force deleted tenant ${tenant.first_name} ${tenant.last_name} and all associated data`,
      deletionSteps,
      tenantId,
      userId: tenant.user_id
    })

  } catch (error) {
    console.error('Force delete error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
} 