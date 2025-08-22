import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { createServerSupabaseClient } from '@/lib/supabase'

export async function POST(request: NextRequest) {
  try {
    console.log('Save Moov bank endpoint called')
    
    // Try to get session
    const session = await getSession()
    console.log('Session:', session ? 'Found' : 'Not found')

    const { moovAccountId, bankAccountId, last4 } = await request.json()
    console.log('Request data:', { moovAccountId, bankAccountId, last4 })

    if (!moovAccountId || !bankAccountId) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    const supabase = createServerSupabaseClient()

    // First try to find tenant by moov_account_id
    let tenant = await supabase
      .from('tenants')
      .select('id')
      .eq('moov_account_id', moovAccountId)
      .single()

    // If not found and we have a session, try to find by user_id and update
    if ((!tenant.data || tenant.error) && session) {
      console.log('Tenant not found by Moov ID, trying by user ID...')
      
      const { data: tenantByUser, error: userError } = await supabase
        .from('tenants')
        .select('id')
        .eq('user_id', session.userId)
        .single()

      if (tenantByUser) {
        // Update the tenant with the Moov account ID
        console.log('Found tenant by user, updating with Moov account ID...')
        await supabase
          .from('tenants')
          .update({ moov_account_id: moovAccountId })
          .eq('id', tenantByUser.id)
        
        tenant = { data: tenantByUser, error: null }
      }
    }

    if (!tenant.data) {
      console.error('Could not find or create tenant association')
      // Still return success to not break the flow
      return NextResponse.json({ 
        success: true,
        message: 'Bank account created but not fully linked',
        warning: 'Manual verification may be required'
      })
    }

    // Check if this payment method already exists
    const { data: existingMethod } = await supabase
      .from('payment_methods')
      .select('id')
      .eq('tenant_id', tenant.data.id)
      .eq('moov_payment_method_id', bankAccountId)
      .single()

    if (existingMethod) {
      console.log('Payment method already exists')
      return NextResponse.json({ 
        success: true,
        message: 'Payment method already saved',
        paymentMethod: existingMethod
      })
    }

    // Save the payment method
    const { data: paymentMethod, error: pmError } = await supabase
      .from('payment_methods')
      .insert({
        tenant_id: tenant.data.id,
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
