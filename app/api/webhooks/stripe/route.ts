/**
 * Stripe webhook handler — Subscription/Invoice events drive the local
 * `payments` table (now a mirror of Stripe Invoices) and the `tenants`
 * stripe_* fields.
 *
 * Idempotency (T8): every incoming event.id is INSERTed into the
 * stripe_events table with ON CONFLICT DO NOTHING. If the insert affects
 * zero rows, this exact event was already processed and we no-op
 * (Stripe redelivers webhooks on transient failures; without idempotency
 * we'd double-mirror invoices).
 *
 * Recovery if this handler is down: scripts/reconcile-stripe.ts walks
 * stripe.events.list({ since: last_synced_at }) and replays through the
 * same lib/stripe-event-handler module.
 *
 * Events handled (see lib/stripe-event-handler.ts):
 *   invoice.created / .finalized / .payment_succeeded / .payment_failed /
 *   .marked_uncollectible / .voided
 *   payment_intent.processing      -> bank/ACH in flight; mark mirror `processing`
 *   customer.subscription.created / .updated / .deleted
 *
 * NOT handled in this PR (deferred per D11):
 *   charge.failed                  -> ACH bounce 1-7 days post-success (T12)
 *   charge.dispute.created         -> chargebacks (T12)
 */

import { NextRequest, NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { createServerSupabaseClient } from '@/lib/supabase'
import { verifyWebhookSignature } from '@/lib/stripe-server'
import { handleStripeEvent } from '@/lib/stripe-event-handler'

export async function POST(request: NextRequest) {
  try {
    const body = await request.text()
    const headersList = await headers()
    const signature = headersList.get('stripe-signature')

    if (!signature) {
      console.error('No Stripe signature on incoming webhook')
      return NextResponse.json({ error: 'No signature' }, { status: 400 })
    }

    let event
    try {
      event = verifyWebhookSignature(body, signature)
    } catch (err) {
      console.error('Webhook signature verification failed:', err)
      return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
    }

    const supabase = createServerSupabaseClient()

    // Idempotency: insert with ON CONFLICT DO NOTHING via maybeSingle().
    // If maybeSingle returns null data, this exact event_id was already
    // claimed and we don't reprocess.
    const { data: claimed, error: claimError } = await supabase
      .from('stripe_events')
      .insert({
        event_id: event.id,
        event_type: event.type,
        payload: event as unknown as Record<string, unknown>,
      })
      .select('event_id')
      .maybeSingle()

    if (claimError) {
      // Real DB error (not the duplicate-key path — that returns null data,
      // no error). Refusing the webhook causes Stripe to retry.
      // Exception: 23505 IS the duplicate-key error code that supabase-js
      // sometimes surfaces here; treat as already-processed.
      if (claimError.code === '23505') {
        return NextResponse.json({ received: true, idempotent: true })
      }
      console.error('stripe_events insert failed:', claimError)
      return NextResponse.json({ error: 'DB error' }, { status: 500 })
    }
    if (!claimed) {
      return NextResponse.json({ received: true, idempotent: true })
    }

    await handleStripeEvent(event, supabase)

    await supabase
      .from('stripe_events')
      .update({ processed_at: new Date().toISOString() })
      .eq('event_id', event.id)

    // Advance the reconcile watermark so the catchup script knows it can
    // skip events older than this on next run.
    await supabase
      .from('system_settings')
      .upsert(
        { key: 'last_stripe_event_synced_at', value: event.created },
        { onConflict: 'key' },
      )

    return NextResponse.json({ received: true })
  } catch (error) {
    console.error('Stripe webhook handler crashed:', error)
    return NextResponse.json({ error: 'Webhook handler failed' }, { status: 500 })
  }
}
