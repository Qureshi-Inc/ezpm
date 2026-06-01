/**
 * POST /api/admin/maintenance/backfill-status-buttons — one-time migration.
 *
 * Re-renders the Mattermost root post of existing requests so they gain the
 * interactive status buttons (older threads were created before buttons existed
 * / used emoji reactions). Idempotent and safe to run repeatedly.
 *
 * Scope: by default only ACTIVE requests (open + in_progress) that have a
 * mattermost_root_id. Pass ?all=1 to also patch resolved/cancelled threads.
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { createServerSupabaseClient } from '@/lib/supabase'
import { updateMaintenanceStatusPost } from '@/lib/mattermost'

export async function POST(request: NextRequest) {
  try {
    await requireAdmin()
    const all = new URL(request.url).searchParams.get('all') === '1'

    const supabase = createServerSupabaseClient()
    let query = supabase
      .from('maintenance_requests')
      .select('id, status, mattermost_root_id')
      .not('mattermost_root_id', 'is', null)
    if (!all) query = query.in('status', ['open', 'in_progress'])

    const { data, error } = await query
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const rows = data ?? []
    // Patch sequentially to stay gentle on the Mattermost API.
    for (const r of rows) {
      await updateMaintenanceStatusPost(r.mattermost_root_id as string, r.id, r.status)
    }

    return NextResponse.json({ success: true, patched: rows.length, scope: all ? 'all' : 'active' })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (error instanceof Error && error.message === 'Forbidden') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    console.error('[backfill-status-buttons] failed:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
