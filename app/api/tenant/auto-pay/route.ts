import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { createServerSupabaseClient } from '@/lib/supabase'

export async function POST(request: NextRequest) {
  try {
    const session = await getSession()
    
    if (!session || session.role !== 'tenant') {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const { tenantId, paymentMethodId, dayOfMonth } = await request.json()

    if (!tenantId || !paymentMethodId || !dayOfMonth) {
      return NextResponse.json(
        { error: 'Tenant ID, payment method ID, and day of month are required' },
        { status: 400 }
      )
    }

    if (dayOfMonth < 1 || dayOfMonth > 31) {
      return NextResponse.json(
        { error: 'Day of month must be between 1 and 31' },
        { status: 400 }
      )
    }

    const supabase = createServerSupabaseClient()

    // Verify the tenant belongs to the current user
    const { data: tenant, error: tenantError } = await supabase
      .from('tenants')
      .select('id')
      .eq('id', tenantId)
      .eq('user_id', session.userId)
      .single()

    if (tenantError || !tenant) {
      return NextResponse.json(
        { error: 'Tenant not found or unauthorized' },
        { status: 404 }
      )
    }

    // Verify the payment method belongs to the tenant
    const { data: paymentMethod, error: pmError } = await supabase
      .from('payment_methods')
      .select('id')
      .eq('id', paymentMethodId)
      .eq('tenant_id', tenantId)
      .single()

    if (pmError || !paymentMethod) {
      return NextResponse.json(
        { error: 'Payment method not found or unauthorized' },
        { status: 404 }
      )
    }

    // Check if auto payment already exists
    const { data: existingAutoPayment } = await supabase
      .from('auto_payments')
      .select('id')
      .eq('tenant_id', tenantId)
      .single()

    if (existingAutoPayment) {
      return NextResponse.json(
        { error: 'Auto payment already exists. Use PUT to update.' },
        { status: 400 }
      )
    }

    // Create auto payment
    const { data: newAutoPayment, error: insertError } = await supabase
      .from('auto_payments')
      .insert({
        tenant_id: tenantId,
        payment_method_id: paymentMethodId,
        day_of_month: dayOfMonth,
        is_active: true,
      })
      .select()
      .single()

    if (insertError) {
      console.error('Auto payment creation error:', insertError)
      return NextResponse.json(
        { error: 'Failed to set up auto payment' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      message: 'Auto payment set up successfully',
      autoPayment: newAutoPayment
    })

  } catch (error) {
    console.error('Auto payment setup error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function PUT(request: NextRequest) {
  try {
    const session = await getSession()
    
    if (!session || session.role !== 'tenant') {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const { tenantId, paymentMethodId, dayOfMonth } = await request.json()

    if (!tenantId || !paymentMethodId || !dayOfMonth) {
      return NextResponse.json(
        { error: 'Tenant ID, payment method ID, and day of month are required' },
        { status: 400 }
      )
    }

    if (dayOfMonth < 1 || dayOfMonth > 31) {
      return NextResponse.json(
        { error: 'Day of month must be between 1 and 31' },
        { status: 400 }
      )
    }

    const supabase = createServerSupabaseClient()

    // Verify the tenant belongs to the current user
    const { data: tenant, error: tenantError } = await supabase
      .from('tenants')
      .select('id')
      .eq('id', tenantId)
      .eq('user_id', session.userId)
      .single()

    if (tenantError || !tenant) {
      return NextResponse.json(
        { error: 'Tenant not found or unauthorized' },
        { status: 404 }
      )
    }

    // Verify the payment method belongs to the tenant
    const { data: paymentMethod, error: pmError } = await supabase
      .from('payment_methods')
      .select('id')
      .eq('id', paymentMethodId)
      .eq('tenant_id', tenantId)
      .single()

    if (pmError || !paymentMethod) {
      return NextResponse.json(
        { error: 'Payment method not found or unauthorized' },
        { status: 404 }
      )
    }

    // Update auto payment
    const { data: updatedAutoPayment, error: updateError } = await supabase
      .from('auto_payments')
      .update({
        payment_method_id: paymentMethodId,
        day_of_month: dayOfMonth,
        is_active: true,
        updated_at: new Date().toISOString(),
      })
      .eq('tenant_id', tenantId)
      .select()
      .single()

    if (updateError) {
      console.error('Auto payment update error:', updateError)
      return NextResponse.json(
        { error: 'Failed to update auto payment' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      message: 'Auto payment updated successfully',
      autoPayment: updatedAutoPayment
    })

  } catch (error) {
    console.error('Auto payment update error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await getSession()
    
    if (!session || session.role !== 'tenant') {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const { tenantId } = await request.json()

    if (!tenantId) {
      return NextResponse.json(
        { error: 'Tenant ID is required' },
        { status: 400 }
      )
    }

    const supabase = createServerSupabaseClient()

    // Verify the tenant belongs to the current user
    const { data: tenant, error: tenantError } = await supabase
      .from('tenants')
      .select('id')
      .eq('id', tenantId)
      .eq('user_id', session.userId)
      .single()

    if (tenantError || !tenant) {
      return NextResponse.json(
        { error: 'Tenant not found or unauthorized' },
        { status: 404 }
      )
    }

    // Disable auto payment (set is_active to false instead of deleting)
    const { error: updateError } = await supabase
      .from('auto_payments')
      .update({
        is_active: false,
        updated_at: new Date().toISOString(),
      })
      .eq('tenant_id', tenantId)

    if (updateError) {
      console.error('Auto payment disable error:', updateError)
      return NextResponse.json(
        { error: 'Failed to disable auto payment' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      message: 'Auto payment disabled successfully'
    })

  } catch (error) {
    console.error('Auto payment disable error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
} 