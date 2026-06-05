/**
 * GET /api/admin/metrics?range=6m — dashboard data for the admin analytics page.
 * Admin-only. range ∈ 1m|3m|6m|1y|2y|max (defaults to 6m).
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { createServerSupabaseClient } from '@/lib/supabase'
import { getDashboardMetrics, RANGES, type MetricsRange } from '@/lib/metrics'

export async function GET(request: NextRequest) {
  try {
    await requireAdmin()
    const raw = request.nextUrl.searchParams.get('range') || '6m'
    const range = (RANGES.some((r) => r.value === raw) ? raw : '6m') as MetricsRange

    const supabase = createServerSupabaseClient()
    const metrics = await getDashboardMetrics(supabase, range)
    return NextResponse.json(metrics, {
      headers: { 'Cache-Control': 'private, no-store, max-age=0' },
    })
  } catch (error) {
    if (error instanceof Error && (error.message === 'Unauthorized' || error.message === 'Forbidden')) {
      return NextResponse.json({ error: error.message }, { status: 401 })
    }
    console.error('[admin/metrics] failed:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
