/**
 * POST /api/webhooks/mattermost — inbound from a Mattermost OUTGOING webhook.
 *
 * When someone replies in the (now public) maintenance channel, Mattermost
 * calls this endpoint. We resolve the reply's thread root, map it to the
 * maintenance request, and mirror the reply as an admin ("Property manager")
 * comment in the app — closing the two-way loop.
 *
 * Setup (Mattermost side):
 *   System Console → Integrations → Enable Outgoing Webhooks = true
 *   Integrations → Outgoing Webhooks → Add:
 *     - Channel: maint-requests (must be PUBLIC)
 *     - Trigger words: (leave empty → fires on every message)
 *     - Content Type: application/json
 *     - Callback URL: https://app.getezpm.com/api/webhooks/mattermost
 *   Copy the webhook's Token → set MATTERMOST_OUTGOING_TOKEN on the app.
 *
 * Safety:
 *   - We verify the payload `token` against MATTERMOST_OUTGOING_TOKEN.
 *   - We ignore the bot's own posts (loop guard) and non-thread messages.
 *   - We ALWAYS return an empty 200 — returning any { text } would make
 *     Mattermost echo it back into the channel (an infinite loop).
 *   - mattermost_post_id is UNIQUE, so a retried callback can't double-post.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'
import { getMattermostPost, getBotUserId } from '@/lib/mattermost'
import { notifyTenantOfReply } from '@/lib/maintenance-notify'
import { safeEqual } from '@/lib/secure-compare'

function ok() {
  // Empty body — never return { text }, or Mattermost posts it back (loop).
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
    if (!expected || !safeEqual(payload.token, expected)) {
      // Unconfigured or spoofed — acknowledge quietly, do nothing.
      return ok()
    }

    // Diagnostic: confirms Mattermost actually delivered (root posts vs thread
    // replies behave differently). Logs no message content beyond a short tag.
    console.log(
      `[webhooks/mattermost] hit: post_id=${payload.post_id || '-'} trigger=${payload.trigger_word || '-'}`,
    )

    const postId = (payload.post_id || '').trim()
    const userId = (payload.user_id || '').trim()

    // If the webhook is configured with a trigger word (e.g. "reply"), the
    // message text starts with it. Strip it so the mirrored comment is just
    // the actual message. trigger_word is empty when the hook fires on every
    // message, in which case we keep the full text.
    let text = (payload.text || '').trim()
    const triggerWord = (payload.trigger_word || '').trim()
    if (triggerWord && text.toLowerCase().startsWith(triggerWord.toLowerCase())) {
      text = text.slice(triggerWord.length).trim()
    }
    if (!postId || !text) return ok()

    // Loop guard: never ingest the bot's own posts.
    const botId = await getBotUserId()
    if (botId && userId === botId) return ok()

    // Resolve the reply's thread root; only thread replies map to a request.
    const post = await getMattermostPost(postId)
    const rootId = post?.root_id || ''
    if (!rootId) return ok()

    const supabase = createServerSupabaseClient()
    const { data: req } = await supabase
      .from('maintenance_requests')
      .select('id')
      .eq('mattermost_root_id', rootId)
      .maybeSingle()
    if (!req) return ok()

    // Insert as an admin comment. The UNIQUE mattermost_post_id makes this
    // idempotent if Mattermost retries the callback.
    const { error } = await supabase.from('maintenance_comments').insert({
      request_id: req.id,
      author_role: 'admin',
      author_user_id: null,
      body: text,
      mattermost_post_id: postId,
    })
    if (error) {
      if (!/duplicate key|unique/i.test(error.message)) {
        console.error('[webhooks/mattermost] insert error:', error)
      }
      // Duplicate (Mattermost retried) — don't email twice.
      return ok()
    }

    // Email the tenant the reply + a link back to the request.
    void notifyTenantOfReply(req.id, text)

    return ok()
  } catch (err) {
    console.error('[webhooks/mattermost] failed:', err)
    return ok() // still 200 so Mattermost doesn't retry-storm
  }
}
