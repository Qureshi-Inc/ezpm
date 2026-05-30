/**
 * POST /api/admin/stripe-reconcile — admin button to manually run the
 * Stripe events catchup.
 *
 * Useful when the server was down for a stretch and you want to verify
 * the local payments mirror matches Stripe's view. Idempotent —
 * already-processed events are skipped.
 *
 * For routine catchup, prefer the CLI script invoked from a Coolify
 * scheduled task: `npm run reconcile-stripe`.
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { reconcileStripeEvents } from '@/lib/stripe-reconcile'

export async function POST(_request: NextRequest) {
  try {
    await requireAdmin()
    const result = await reconcileStripeEvents()
    return NextResponse.json({
      success: true,
      message: `Reconcile complete. processed=${result.processed} skipped=${result.skipped} unhandled=${result.unhandled}`,
      result,
    })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (error instanceof Error && error.message === 'Forbidden') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    console.error('Stripe reconcile failed:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 },
    )
  }
}
