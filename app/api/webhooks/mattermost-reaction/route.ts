/**
 * POST /api/webhooks/mattermost-reaction — inbound from the mattermost-bridge.
 *
 * When a human adds a status emoji to a maintenance request's root post in
 * Mattermost, the bridge relays it here. We map the emoji to a status and run
 * the same applyMaintenanceStatus path the web UI uses, so the DB updates, the
 * tenant gets the status email (if opted in), and the web app reflects it.
 *
 * Only reaction_added is handled (reaction_removed is ambiguous — there's no
 * "previous status" to revert to). 'open'/reopen has no emoji; use the web UI.
 *
 * Body (form-encoded, from the bridge): token, post_id, emoji, user_id.
 * Always returns an empty 200.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'
import { applyMaintenanceStatus } from '@/lib/maintenance-status'
import { type MaintenanceStatus } from '@/lib/email'

const EMOJI_TO_STATUS: Record<string, MaintenanceStatus> = {
  hammer_and_wrench: 'in_progress',
  white_check_mark: 'resolved',
  no_entry_sign: 'cancelled',
}

function ok() {
  return new NextResponse(null, { status: 200 })
}

export async function POST(request: NextRequest) {
  try {
    const ct = request.headers.get('content-type') || ''
    let payload: Record<string, string> = {}
    if (ct.includes('application/json')) {
      payload = (await request.json().catch(() => ({}))) as Record<string, string>
    } else {
      const fd = await request.formData().catch(() => null)
      if (fd) payload = Object.fromEntries([...fd.entries()].map(([k, v]) => [k, String(v)]))
    }

    const expected = process.env.MATTERMOST_OUTGOING_TOKEN
    if (!expected || payload.token !== expected) return ok()

    const postId = (payload.post_id || '').trim()
    const emoji = (payload.emoji || '').trim()
    const status = EMOJI_TO_STATUS[emoji]
    if (!postId || !status) return ok()

    const supabase = createServerSupabaseClient()
    const { data: req } = await supabase
      .from('maintenance_requests')
      .select('id')
      .eq('mattermost_root_id', postId)
      .maybeSingle()
    if (!req) return ok()

    await applyMaintenanceStatus(req.id, status)
    return ok()
  } catch (err) {
    console.error('[webhooks/mattermost-reaction] failed:', err)
    return ok()
  }
}
