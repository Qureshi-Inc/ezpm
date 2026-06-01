/**
 * POST /api/webhooks/mattermost-action — Mattermost interactive button callback.
 *
 * When someone clicks a status button on a maintenance request's root post,
 * Mattermost POSTs here with the button's `context` (which we authored). We
 * authenticate via the shared secret embedded in that context (button POSTs
 * don't carry the outgoing-webhook token), then run the same
 * applyMaintenanceStatus path as the web UI — DB update, tenant email/SMS, and
 * a re-render of the buttons to show the new live status.
 *
 * Mattermost expects a 200 with an optional JSON body; `ephemeral_text` is shown
 * only to the clicking user as a quiet acknowledgement.
 */

import { NextRequest, NextResponse } from 'next/server'
import { applyMaintenanceStatus, MAINT_STATUSES } from '@/lib/maintenance-status'
import { type MaintenanceStatus } from '@/lib/email'
import { safeEqual } from '@/lib/secure-compare'

const STATUS_LABEL: Record<string, string> = {
  open: 'Open',
  in_progress: 'In progress',
  resolved: 'Resolved',
  cancelled: 'Cancelled',
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      context?: { requestId?: string; status?: string; action?: string; secret?: string }
      post_id?: string
      team_domain?: string
    }
    const ctx = body.context ?? {}

    const expected = process.env.MATTERMOST_ACTION_SECRET
    if (!expected || !safeEqual(ctx.secret, expected)) {
      return NextResponse.json({ ephemeral_text: 'Not authorized.' }, { status: 403 })
    }

    // "Reply to tenant" button — return a permalink that jumps to this thread.
    if (ctx.action === 'reply') {
      const base = (process.env.MATTERMOST_URL || 'https://mm.qureshi.io').replace(/\/$/, '')
      const team = body.team_domain || process.env.MATTERMOST_TEAM
      const link = team && body.post_id ? `${base}/${team}/pl/${body.post_id}` : null
      return NextResponse.json(
        {
          ephemeral_text: link
            ? `[Open the thread →](${link})\n\nReply inside the thread — it posts back to the tenant (and emails/texts them if they're opted in).`
            : `Reply in this request's thread — it posts back to the tenant.`,
        },
        { status: 200 },
      )
    }

    const requestId = (ctx.requestId || '').trim()
    const status = ctx.status as MaintenanceStatus
    if (!requestId || !MAINT_STATUSES.includes(status)) {
      return NextResponse.json({ ephemeral_text: 'Invalid status action.' }, { status: 400 })
    }

    const result = await applyMaintenanceStatus(requestId, status)
    if (result.notFound) {
      return NextResponse.json({ ephemeral_text: 'That request no longer exists.' }, { status: 200 })
    }

    return NextResponse.json(
      { ephemeral_text: `Status set to ${STATUS_LABEL[status] ?? status}.` },
      { status: 200 },
    )
  } catch (err) {
    console.error('[webhooks/mattermost-action] failed:', err)
    return NextResponse.json({ ephemeral_text: 'Something went wrong.' }, { status: 200 })
  }
}
