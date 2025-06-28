import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'
import { getTransferStatus } from '@/lib/moov-server'

export async function POST(request: NextRequest) {
  try {
    const body = await request.text()
    const signature = request.headers.get('x-moov-signature')
    
    // In production, you should verify the webhook signature
    // For now, we'll process the webhook without verification in sandbox
    
    console.log('Moov webhook received:', { body, signature })
    
    const event = JSON.parse(body)
    
    // Handle different webhook event types
    switch (event.eventType) {
      case 'transfer.completed':
        await handleTransferCompleted(event.data)
        break
      case 'transfer.failed':
        await handleTransferFailed(event.data)
        break
      case 'transfer.canceled':
        await handleTransferCanceled(event.data)
        break
      default:
        console.log('Unhandled webhook event type:', event.eventType)
    }
    
    return NextResponse.json({ received: true })
  } catch (error) {
    console.error('Webhook error:', error)
    return NextResponse.json(
      { error: 'Webhook processing failed' },
      { status: 400 }
    )
  }
}

async function handleTransferCompleted(transferData: any) {
  console.log('Transfer completed:', transferData.transferID)
  
  const supabase = createServerSupabaseClient()
  
  // Find the payment associated with this transfer
  const { data: payment, error: paymentError } = await supabase
    .from('payments')
    .select('*')
    .eq('moov_transfer_id', transferData.transferID)
    .single()
    
  if (paymentError || !payment) {
    console.error('Payment not found for transfer:', transferData.transferID)
    return
  }
  
  // Update payment status to succeeded
  const { error: updateError } = await supabase
    .from('payments')
    .update({ 
      status: 'succeeded',
      paid_at: new Date().toISOString()
    })
    .eq('id', payment.id)
    
  if (updateError) {
    console.error('Failed to update payment status:', updateError)
  } else {
    console.log('Payment marked as succeeded:', payment.id)
  }
}

async function handleTransferFailed(transferData: any) {
  console.log('Transfer failed:', transferData.transferID)
  
  const supabase = createServerSupabaseClient()
  
  // Find the payment associated with this transfer
  const { data: payment, error: paymentError } = await supabase
    .from('payments')
    .select('*')
    .eq('moov_transfer_id', transferData.transferID)
    .single()
    
  if (paymentError || !payment) {
    console.error('Payment not found for transfer:', transferData.transferID)
    return
  }
  
  // Update payment status to failed
  const { error: updateError } = await supabase
    .from('payments')
    .update({ 
      status: 'failed'
    })
    .eq('id', payment.id)
    
  if (updateError) {
    console.error('Failed to update payment status:', updateError)
  } else {
    console.log('Payment marked as failed:', payment.id)
  }
}

async function handleTransferCanceled(transferData: any) {
  console.log('Transfer canceled:', transferData.transferID)
  
  const supabase = createServerSupabaseClient()
  
  // Find the payment associated with this transfer
  const { data: payment, error: paymentError } = await supabase
    .from('payments')
    .select('*')
    .eq('moov_transfer_id', transferData.transferID)
    .single()
    
  if (paymentError || !payment) {
    console.error('Payment not found for transfer:', transferData.transferID)
    return
  }
  
  // Update payment status to failed
  const { error: updateError } = await supabase
    .from('payments')
    .update({ 
      status: 'failed'
    })
    .eq('id', payment.id)
    
  if (updateError) {
    console.error('Failed to update payment status:', updateError)
  } else {
    console.log('Payment marked as failed (canceled):', payment.id)
  }
} 