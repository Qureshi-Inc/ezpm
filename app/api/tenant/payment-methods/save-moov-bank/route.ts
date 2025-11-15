import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { createServerSupabaseClient } from '@/lib/supabase'

export async function POST(request: NextRequest) {
  try {
    console.log('🏦 Save Moov bank endpoint called')
    
    const requestBody = await request.json()
    const { moovAccountId, bankAccountId, last4 } = requestBody
    console.log('📝 Request data:', { moovAccountId, bankAccountId, last4 })

    if (!moovAccountId || !bankAccountId) {
      console.error('❌ Missing required fields in request body:', { moovAccountId, bankAccountId })
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    const supabase = createServerSupabaseClient()
    const session = await getSession()
    
    if (!session) {
      console.error('❌ No session found')
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    console.log('👤 Session user ID:', session.userId)
    
    // Strategy: Find tenant by session first, then update moov_account_id if needed
    let tenantId: string | null = null
    let tenantMoovAccountId: string | null = null
    
    // 1. First, find the tenant by session user ID
    console.log('🔍 Finding tenant by session user ID...')
    const { data: tenantBySession, error: tenantSessionError } = await supabase
      .from('tenants')
      .select('id, moov_account_id')
      .eq('user_id', session.userId)
      .single()
    
    if (tenantBySession) {
      console.log('✅ Found tenant by session:', {
        id: tenantBySession.id,
        existing_moov_id: tenantBySession.moov_account_id
      })
      
      tenantId = tenantBySession.id
      tenantMoovAccountId = tenantBySession.moov_account_id
      
      // Update moov_account_id if it's different or missing
      if (!tenantBySession.moov_account_id || tenantBySession.moov_account_id !== moovAccountId) {
        console.log('🔄 Updating tenant with new Moov account ID...')
        const { error: updateError } = await supabase
          .from('tenants')
          .update({ moov_account_id: moovAccountId })
          .eq('id', tenantId)
        
        if (updateError) {
          console.error('⚠️ Failed to update Moov account ID:', updateError)
        } else {
          console.log('✅ Updated tenant with Moov account ID:', moovAccountId)
          tenantMoovAccountId = moovAccountId
        }
      }
    } else {
      console.error('❌ No tenant found for session user:', session.userId)
      console.error('Error:', tenantSessionError)
    }

    if (!tenantId) {
      console.error('❌ Critical: Could not determine tenant ID for saving payment method.')
      return NextResponse.json({ 
        success: false,
        error: 'Could not link bank account to a tenant. Please ensure you are logged in.'
      }, { status: 500 })
    }

    console.log('📊 Final tenant state:', { tenantId, tenantMoovAccountId })

    // Check if this payment method already exists
    console.log('🔍 Checking for existing payment method...')
    const { data: existingMethod, error: checkError } = await supabase
      .from('payment_methods')
      .select('id')
      .eq('user_id', session.userId)
      .eq('moov_payment_method_id', bankAccountId)
      .single()

    if (checkError && checkError.code !== 'PGRST116') {
      console.error('⚠️ Error checking for existing payment method:', checkError)
    }

    if (existingMethod) {
      console.log('✅ Payment method already exists:', existingMethod.id)
      return NextResponse.json({ 
        success: true,
        message: 'Payment method already saved',
        paymentMethod: existingMethod
      })
    }

    // Save the new payment method
    console.log('💾 Saving new payment method for user:', session.userId)
    const { data: paymentMethod, error: pmError } = await supabase
      .from('payment_methods')
      .insert({
        user_id: session.userId,
        type: 'ach',
        moov_payment_method_id: bankAccountId,
        last4: last4 || '****',
        is_default: false,
        status: 'pending' // Bank accounts need verification before use
      })
      .select()
      .single()

    if (pmError) {
      console.error('❌ Failed to save payment method:', pmError)
      return NextResponse.json(
        { error: 'Failed to save payment method', details: pmError.message },
        { status: 500 }
      )
    }

    console.log('🎉 Payment method saved successfully:', paymentMethod.id)
    
    // Try to initiate micro-deposits (don't fail if this doesn't work)
    try {
      console.log('Attempting to initiate micro-deposits...')
      const { initiateMicroDeposits } = await import('@/lib/moov-server')
      const result = await initiateMicroDeposits(moovAccountId, bankAccountId)
      console.log('Micro-deposits initiation result:', result)
    } catch (error) {
      console.log('Could not initiate micro-deposits (this is okay):', error)
      // Don't fail the whole request if micro-deposits can't be initiated
      // User can initiate them later during verification
    }

    return NextResponse.json({ 
      success: true,
      paymentMethod 
    })

  } catch (error: any) {
    console.error('🚨 Uncaught error in save-moov-bank endpoint:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    )
  }
}
