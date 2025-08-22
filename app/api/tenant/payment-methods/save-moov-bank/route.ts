import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { createServerSupabaseClient } from '@/lib/supabase'

export async function POST(request: NextRequest) {
  try {
    console.log('Save Moov bank endpoint called')
    
    // Try to get session, but don't fail if it's not there
    // This endpoint is called from the onboarding widget which may not have cookies
    const session = await getSession()
    console.log('Session:', session ? 'Found' : 'Not found')
    
    // For now, we'll allow the request to proceed even without a session
    // In production, you'd want to verify the request is legitimate
    // (e.g., by checking a temporary token or verifying the Moov webhook)

    const { moovAccountId, bankAccountId, last4 } = await request.json()
    console.log('Request data:', { moovAccountId, bankAccountId, last4 })

    if (!moovAccountId || !bankAccountId) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    const supabase = createServerSupabaseClient()

    // Get the tenant associated with this Moov account
    // We find by moov_account_id since session might not be available
    const { data: tenant, error: tenantError } = await supabase
      .from('tenants')
      .select('id')
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
        is_default: false,
        is_verified: false // Bank accounts need verification before use
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
