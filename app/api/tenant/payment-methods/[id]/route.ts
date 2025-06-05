import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { createServerSupabaseClient } from '@/lib/supabase'

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getSession()
    
    if (!session || session.role !== 'tenant') {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const { id } = await params
    const supabase = createServerSupabaseClient()

    // Get the payment method and verify it belongs to the current user
    const { data: paymentMethod, error: fetchError } = await supabase
      .from('payment_methods')
      .select(`
        id,
        tenant_id,
        type,
        last4,
        is_default
      `)
      .eq('id', id)
      .single()

    if (fetchError || !paymentMethod) {
      return NextResponse.json(
        { error: 'Payment method not found' },
        { status: 404 }
      )
    }

    // Get the tenant to verify ownership
    const { data: tenant, error: tenantError } = await supabase
      .from('tenants')
      .select('user_id')
      .eq('id', paymentMethod.tenant_id)
      .single()

    if (tenantError || !tenant || tenant.user_id !== session.userId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Check if this payment method is being used for auto-pay
    const { data: autoPayment } = await supabase
      .from('auto_payments')
      .select('id')
      .eq('payment_method_id', id)
      .eq('is_active', true)
      .single()

    if (autoPayment) {
      return NextResponse.json(
        { error: 'Cannot delete payment method that is set up for auto-pay. Please disable auto-pay first.' },
        { status: 400 }
      )
    }

    // Delete the payment method
    const { error: deleteError } = await supabase
      .from('payment_methods')
      .delete()
      .eq('id', id)

    if (deleteError) {
      console.error('Delete payment method error:', deleteError)
      return NextResponse.json(
        { error: 'Failed to delete payment method' },
        { status: 500 }
      )
    }

    // If the deleted payment method was the default, make another one default (if any exist)
    if (paymentMethod.is_default) {
      const { data: remainingMethods } = await supabase
        .from('payment_methods')
        .select('id')
        .eq('tenant_id', paymentMethod.tenant_id)
        .limit(1)

      if (remainingMethods && remainingMethods.length > 0) {
        await supabase
          .from('payment_methods')
          .update({ is_default: true })
          .eq('id', remainingMethods[0].id)
      }
    }

    return NextResponse.json({
      success: true,
      message: `${paymentMethod.type === 'card' ? 'Card' : 'Bank account'} ending in ${paymentMethod.last4} removed successfully`
    })

  } catch (error) {
    console.error('Delete payment method error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
} 