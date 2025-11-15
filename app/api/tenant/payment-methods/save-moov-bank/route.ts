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

    // First verify the user exists in the users table
    const { data: userCheck, error: userCheckError } = await supabase
      .from('users')
      .select('id')
      .eq('id', session.userId)
      .single()

    if (userCheckError || !userCheck) {
      console.error('❌ User not found in users table:', {
        userId: session.userId,
        error: userCheckError
      })

      // Debug: Show what users do exist (first few for debugging)
      const { data: allUsers, error: allUsersError } = await supabase
        .from('users')
        .select('id, email')
        .limit(5)

      console.log('🔍 Debug - First 5 users in database:', {
        users: allUsers,
        error: allUsersError
      })

      return NextResponse.json({
        error: 'User not found in database. Please contact support.',
        details: 'Session user ID does not exist in users table'
      }, { status: 400 })
    }

    console.log('✅ User exists in users table')

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

    // Additional validation before payment method insert
    if (!session.userId || !tenantId || !bankAccountId) {
      console.error('❌ Missing required fields for payment method insert:', {
        userId: session.userId,
        tenantId: tenantId,
        bankAccountId: bankAccountId
      })
      return NextResponse.json({
        error: 'Missing required information for saving payment method',
        details: 'User ID, tenant ID, or bank account ID is missing'
      }, { status: 400 })
    }

    // Check if this payment method already exists
    console.log('🔍 Checking for existing payment method...')
    const { data: existingMethod, error: checkError } = await supabase
      .from('payment_methods')
      .select('id')
      .eq('user_id', session.userId)
      .or(`provider_payment_method_id.eq.${bankAccountId},moov_payment_method_id.eq.${bankAccountId}`)
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
    console.log('💾 Saving new payment method:', {
      userId: session.userId,
      tenantId: tenantId,
      bankAccountId: bankAccountId,
      last4: last4 || '****'
    })

    const { data: paymentMethod, error: pmError } = await supabase
      .from('payment_methods')
      .insert({
        user_id: session.userId,                    // checked against public.users
        tenant_id: tenantId,                        // multi-tenant link

        type: 'ach',                               // bank account type
        provider: 'moov',                          // payment provider
        provider_payment_method_id: bankAccountId, // provider's ID

        moov_payment_method_id: bankAccountId,     // backwards compatibility
        last4: last4 || '****',                   // last 4 digits
        last_four: last4 || '****',               // legacy field if exists
        bank_name: 'Test Bank',                    // could be real name from Moov

        is_default: true,                          // first bank account is default
        is_active: true,                           // active by default
        is_verified: false,                        // needs micro-deposit verification
        status: 'pending'                          // pending verification
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
