/**
 * Stripe events reconciliation library.
 *
 * Walks stripe.events.list since the system_settings watermark and replays
 * each event through lib/stripe-event-handler. Idempotency is enforced by
 * inserting into stripe_events with ON CONFLICT — events already processed
 * by the live webhook are skipped at the DB layer.
 *
 * Called from:
 *   - scripts/reconcile-stripe.ts (CLI; `npm run reconcile-stripe`)
 *   - app/api/admin/stripe-reconcile/route.ts (admin button)
 */

import { stripe } from './stripe-server'
import { createServerSupabaseClient } from './supabase'
import { handleStripeEvent } from './stripe-event-handler'
import type Stripe from 'stripe'

export const RECONCILE_HANDLED_EVENT_TYPES = new Set<string>([
  'invoice.created',
  'invoice.finalized',
  'invoice.payment_succeeded',
  'invoice.payment_failed',
  'invoice.marked_uncollectible',
  'invoice.voided',
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
])

export interface ReconcileOptions {
  since?: number
  dryRun?: boolean
  // Cap how many events we replay in one run. Stripe paginates at 100; we'll
  // walk multiple pages but stop at this many TOTAL events to avoid runaway
  // batches. Default 500.
  maxEvents?: number
}

export interface ReconcileResult {
  processed: number
  skipped: number
  unhandled: number
  highestSeenAt: number
  watermarkUpdated: boolean
  since: number
  dryRun: boolean
}

export async function reconcileStripeEvents(
  options: ReconcileOptions = {},
): Promise<ReconcileResult> {
  const dryRun = !!options.dryRun
  const maxEvents = options.maxEvents ?? 500
  const supabase = createServerSupabaseClient()

  let since = options.since
  if (since === undefined) {
    const { data } = await supabase
      .from('system_settings')
      .select('value')
      .eq('key', 'last_stripe_event_synced_at')
      .maybeSingle()
    since = Number(data?.value) || Math.floor(Date.now() / 1000) - 24 * 60 * 60
  }

  // Collect oldest-first so the payments mirror progresses monotonically.
  const buffer: Stripe.Event[] = []
  for await (const event of stripe.events.list({ created: { gt: since }, limit: 100 })) {
    buffer.push(event)
    if (buffer.length >= maxEvents) break
  }
  buffer.sort((a, b) => a.created - b.created)

  let processed = 0
  let skipped = 0
  let unhandled = 0
  let highestSeenAt = since

  for (const event of buffer) {
    if (event.created > highestSeenAt) highestSeenAt = event.created

    if (!RECONCILE_HANDLED_EVENT_TYPES.has(event.type)) {
      unhandled++
      continue
    }
    if (dryRun) {
      processed++
      continue
    }

    const { data: claimed, error: claimError } = await supabase
      .from('stripe_events')
      .insert({
        event_id: event.id,
        event_type: event.type,
        payload: event as unknown as Record<string, unknown>,
      })
      .select('event_id')
      .maybeSingle()

    if (claimError && claimError.code !== '23505') {
      console.error(`Failed to claim event ${event.id}: ${claimError.message}`)
      continue
    }
    if (!claimed) {
      skipped++
      continue
    }

    await handleStripeEvent(event, supabase)
    await supabase
      .from('stripe_events')
      .update({ processed_at: new Date().toISOString() })
      .eq('event_id', event.id)
    processed++
  }

  let watermarkUpdated = false
  if (!dryRun && highestSeenAt > since) {
    await supabase
      .from('system_settings')
      .upsert(
        { key: 'last_stripe_event_synced_at', value: highestSeenAt },
        { onConflict: 'key' },
      )
    watermarkUpdated = true
  }

  return { processed, skipped, unhandled, highestSeenAt, watermarkUpdated, since, dryRun }
}
