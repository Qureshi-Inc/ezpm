import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { createServerSupabaseClient } from '@/lib/supabase'
import { getTransferStatus } from '@/lib/moov-server'

export async function POST(request: NextRequest) {
  try {
    const session = await getSession()
    
    if (!session || session.role !== 'tenant') {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const { paymentId } = await request.json()

    if (!paymentId) {
      return NextResponse.json(
        { error: 'Payment ID is required' },
        { status: 400 }
      )
    }

    const supabase = createServerSupabaseClient()

    // Get the payment
    const { data: payment, error: paymentError } = await supabase
      .from('payments')
      .select('*')
      .eq('id', paymentId)
      .eq('tenant_id', session.userId)
      .single()

    if (paymentError || !payment) {
      return NextResponse.json(
        { error: 'Payment not found' },
        { status: 404 }
      )
    }

    // Only check Moov transfers
    if (!payment.moov_transfer_id) {
      return NextResponse.json(
        { error: 'This payment is not a Moov transfer' },
        { status: 400 }
      )
    }

    // Get transfer status from Moov
    const transferStatus = await getTransferStatus(payment.moov_transfer_id)

    // Update payment status if it has changed
    if (transferStatus.status !== payment.status) {
      const { error: updateError } = await supabase
        .from('payments')
        .update({ 
          status: transferStatus.status,
          paid_at: transferStatus.status === 'completed' ? new Date().toISOString() : null
        })
        .eq('id', paymentId)

      if (updateError) {
        console.error('Failed to update payment status:', updateError)
      }
    }

    return NextResponse.json({
      paymentId,
      moovTransferId: payment.moov_transfer_id,
      currentStatus: transferStatus.status,
      transferDetails: transferStatus
    })

  } catch (error) {
    console.error('Check status error:', error)
    return NextResponse.json(
      { error: 'Failed to check transfer status' },
      { status: 500 }
    )
  }
} 