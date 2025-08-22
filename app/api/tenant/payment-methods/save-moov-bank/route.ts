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

    const { moovAccountId, bankAccountId, last4 } = await request.json()

    if (!moovAccountId || !bankAccountId) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    const supabase = createServerSupabaseClient()

    // Get the tenant associated with this Moov account
    const { data: tenant, error: tenantError } = await supabase
      .from('tenants')
      .select('id')
      .eq('user_id', session.userId)
      .eq('moov_account_id', moovAccountId)
      .single()

    if (tenantError || !tenant) {
      console.error('Tenant lookup error:', tenantError)
      return NextResponse.json(
        { error: 'Tenant not found' },
        { status: 404 }
      )
    }

    // Check if this payment method already exists
    const { data: existingMethod } = await supabase
      .from('payment_methods')
      .select('id')
      .eq('tenant_id', tenant.id)
      .eq('moov_payment_method_id', bankAccountId)
      .single()

    if (existingMethod) {
      console.log('Payment method already exists')
      return NextResponse.json({ 
        success: true,
        message: 'Payment method already saved' 
      })
    }

    // Save the payment method
    const { data: paymentMethod, error: pmError } = await supabase
      .from('payment_methods')
      .insert({
        tenant_id: tenant.id,
        type: 'moov_ach',
        moov_payment_method_id: bankAccountId,
        last4: last4 || '****',
        is_default: false
      })
      .select()
      .single()

    if (pmError) {
      console.error('Failed to save payment method:', pmError)
      return NextResponse.json(
        { error: 'Failed to save payment method' },
        { status: 500 }
      )
    }

    console.log('Payment method saved:', paymentMethod)

    return NextResponse.json({ 
      success: true,
      paymentMethod 
    })

  } catch (error) {
    console.error('Error saving Moov bank account:', error)
    return NextResponse.json(
      { error: 'Failed to save bank account' },
      { status: 500 }
    )
  }
}
