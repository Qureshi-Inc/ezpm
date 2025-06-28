import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { createServerSupabaseClient } from '@/lib/supabase'
import { createMoovAccount } from '@/lib/moov-server'

export async function POST(request: NextRequest) {
  try {
    const session = await getSession()
    
    if (!session || session.role !== 'tenant') {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const { tenantId, moovPaymentMethodId, accountNumber, routingNumber } = await request.json()

    if (!tenantId || !moovPaymentMethodId || !accountNumber || !routingNumber) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    // Verify the tenant belongs to the current user
    const supabase = createServerSupabaseClient()
    
    const { data: tenant, error: tenantError } = await supabase
      .from('tenants')
      .select('id, first_name, last_name, moov_account_id, users!inner(email)')
      .eq('id', tenantId)
      .eq('user_id', session.userId)
      .single()

    if (tenantError || !tenant) {
      return NextResponse.json(
        { error: 'Tenant not found or unauthorized' },
        { status: 404 }
      )
    }

    // Create Moov account if tenant doesn't have one
    let moovAccountId = tenant.moov_account_id
    
    if (!moovAccountId) {
      try {
        const moovAccount = await createMoovAccount({
          firstName: tenant.first_name,
          lastName: tenant.last_name,
          email: tenant.users[0]?.email,
          tenantId: tenantId
        })
        
        moovAccountId = moovAccount.accountID
        
        // Save the Moov account ID to the tenant
        const { error: updateError } = await supabase
          .from('tenants')
          .update({ moov_account_id: moovAccountId })
          .eq('id', tenantId)
          
        if (updateError) {
          console.error('Failed to save Moov account ID:', updateError)
          return NextResponse.json(
            { error: 'Failed to create Moov account' },
            { status: 500 }
          )
        }
      } catch (error) {
        console.error('Failed to create Moov account:', error)
        return NextResponse.json(
          { error: 'Failed to create Moov account' },
          { status: 500 }
        )
      }
    }

    // Save the payment method to the database
    const paymentMethodData = {
      tenant_id: tenantId,
      type: 'moov_ach',
      moov_payment_method_id: moovPaymentMethodId,
      last4: accountNumber.slice(-4),
      is_default: false
    }

    const { data: paymentMethod, error: pmError } = await supabase
      .from('payment_methods')
      .insert(paymentMethodData)
      .select()
      .single()

    if (pmError) {
      console.error('Failed to save payment method:', pmError)
      return NextResponse.json(
        { error: 'Failed to save payment method' },
        { status: 500 }
      )
    }

    return NextResponse.json({ 
      paymentMethod,
      moovAccountId 
    })
    
  } catch (error) {
    console.error('Failed to add Moov payment method:', error)
    return NextResponse.json(
      { error: 'Failed to add payment method' },
      { status: 500 }
    )
  }
} 