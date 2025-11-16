import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'

export async function POST(request: NextRequest) {
  try {
    // Session validation
    const cookie = request.headers.get('cookie')
    const sessionCookie = cookie?.split(';')
      .find(c => c.trim().startsWith('session='))
      ?.split('=')[1]

    if (!sessionCookie) {
      return NextResponse.json({ error: 'No session found' }, { status: 401 })
    }

    let session
    try {
      session = JSON.parse(decodeURIComponent(sessionCookie))
    } catch (err) {
      return NextResponse.json({ error: 'Invalid session' }, { status: 401 })
    }

    if (!session.userId) {
      return NextResponse.json({ error: 'Invalid session data' }, { status: 401 })
    }

    const { accountId, paymentMethod } = await request.json()

    if (!accountId || !paymentMethod) {
      return NextResponse.json(
        { error: 'Account ID and payment method are required' },
        { status: 400 }
      )
    }

    console.log('Saving Moov Drop payment method:', JSON.stringify(paymentMethod, null, 2))

    // Get tenant info for database record
    const supabase = createServerSupabaseClient()
    const { data: tenant, error: tenantError } = await supabase
      .from('tenants')
      .select('id')
      .eq('user_id', session.userId)
      .single()

    if (tenantError || !tenant) {
      console.error('Failed to get tenant:', tenantError)
      return NextResponse.json(
        { error: 'Tenant not found' },
        { status: 404 }
      )
    }

    // Extract payment method details based on type
    let paymentMethodData: any = {
      user_id: session.userId,
      tenant_id: tenant.id,
      provider: 'moov',
      is_default: true,
      is_active: true,
      is_verified: false, // Will be verified through separate flow
      status: 'pending'
    }

    if (paymentMethod.bankAccount) {
      // Bank account from Moov Drop
      const bankAccount = paymentMethod.bankAccount
      paymentMethodData = {
        ...paymentMethodData,
        type: 'ach',
        moov_payment_method_id: bankAccount.bankAccountID,
        provider_payment_method_id: bankAccount.bankAccountID,
        last4: bankAccount.accountNumber?.slice(-4) || '****',
        last_four: bankAccount.accountNumber?.slice(-4) || '****',
        bank_name: bankAccount.bankName || 'Unknown Bank'
      }
    } else if (paymentMethod.card) {
      // Card from Moov Drop
      const card = paymentMethod.card
      paymentMethodData = {
        ...paymentMethodData,
        type: 'card',
        moov_payment_method_id: card.cardID,
        provider_payment_method_id: card.cardID,
        last4: card.lastFourCardNumber || '****',
        last_four: card.lastFourCardNumber || '****',
        card_brand: card.brand?.toLowerCase() || 'unknown'
      }
    } else {
      return NextResponse.json(
        { error: 'Invalid payment method type' },
        { status: 400 }
      )
    }

    console.log('Inserting payment method:', JSON.stringify(paymentMethodData, null, 2))

    // Insert payment method into database
    const { data: newPaymentMethod, error: insertError } = await supabase
      .from('payment_methods')
      .insert(paymentMethodData)
      .select()
      .single()

    if (insertError) {
      console.error('Failed to save payment method:', insertError)
      return NextResponse.json(
        { error: 'Failed to save payment method', details: insertError.message },
        { status: 500 }
      )
    }

    console.log('Payment method saved successfully:', newPaymentMethod.id)

    return NextResponse.json({
      success: true,
      paymentMethodId: newPaymentMethod.id,
      type: paymentMethodData.type
    })

  } catch (error) {
    console.error('Error saving Moov Drop payment method:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}