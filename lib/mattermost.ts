/**
 * Mattermost Bot API client for the maintenance channel.
 *
 * The other notifications (signup, subscription, rent) use an incoming webhook
 * (lib/notify.ts). Maintenance is different: we want ONE THREAD PER REQUEST in a
 * dedicated channel, and incoming webhooks can't thread. So this module talks to
 * the Bot API directly (POST /api/v4/posts) using the bot's access token, which
 * returns the created post id — letting us reply under it (root_id) for the life
 * of the request.
 *
 * Configuration:
 *   MATTERMOST_URL                    - base URL, default https://mm.qureshi.io
 *   MATTERMOST_BOT_TOKEN              - access token for the bot account
 *                                       (System Console → Integrations → Bot
 *                                       Accounts → ezpm bot → Create Token).
 *                                       NOT the incoming-webhook URL.
 *   MATTERMOST_MAINTENANCE_CHANNEL_ID - the channel's 26-char id (preferred), OR
 *   MATTERMOST_TEAM + MATTERMOST_MAINTENANCE_CHANNEL
 *                                     - team name + channel name to resolve the
 *                                       id automatically (default channel name:
 *                                       ezpm-maintenance).
 *
 * The bot must be a MEMBER of the channel (add it once after creating it).
 *
 * FIRE-AND-FORGET everywhere: a Mattermost outage / missing token never throws
 * and never blocks the request that triggered it.
 */

const BASE = (process.env.MATTERMOST_URL || 'https://mm.qureshi.io').replace(/\/$/, '')
const TOKEN = process.env.MATTERMOST_BOT_TOKEN
const EXPLICIT_CHANNEL_ID = process.env.MATTERMOST_MAINTENANCE_CHANNEL_ID
const TEAM = process.env.MATTERMOST_TEAM
const CHANNEL_NAME = process.env.MATTERMOST_MAINTENANCE_CHANNEL || 'ezpm-maintenance'

export function isMattermostBotConfigured(): boolean {
  return !!TOKEN && (!!EXPLICIT_CHANNEL_ID || !!TEAM)
}

async function api<T>(path: string, init: RequestInit = {}): Promise<T | null> {
  if (!TOKEN) return null
  try {
    const res = await fetch(`${BASE}/api/v4${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        'Content-Type': 'application/json',
        ...(init.headers || {}),
      },
      signal: AbortSignal.timeout(6000),
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      console.warn(`[mattermost] ${init.method || 'GET'} ${path} -> ${res.status}: ${body.slice(0, 160)}`)
      return null
    }
    return (await res.json()) as T
  } catch (err) {
    console.warn('[mattermost] request failed (non-fatal):', err instanceof Error ? err.message : err)
    return null
  }
}

// Cache the resolved channel id for the process lifetime.
let cachedChannelId: string | null = null

async function maintenanceChannelId(): Promise<string | null> {
  if (EXPLICIT_CHANNEL_ID) return EXPLICIT_CHANNEL_ID
  if (cachedChannelId) return cachedChannelId
  if (!TEAM) return null
  const channel = await api<{ id: string }>(
    `/teams/name/${encodeURIComponent(TEAM)}/channels/name/${encodeURIComponent(CHANNEL_NAME)}`,
  )
  cachedChannelId = channel?.id ?? null
  return cachedChannelId
}

/** A file to attach to a Mattermost post (raw bytes — uploaded via the Files API). */
export interface MattermostUpload {
  filename: string
  contentType: string
  bytes: ArrayBuffer | Uint8Array
}

/**
 * Upload one file to a channel via POST /api/v4/files and return its file id.
 * Multipart upload — we must NOT set Content-Type (let fetch add the boundary),
 * so this can't go through api() which forces application/json.
 *
 * Uses Blob (not File) with an explicit filename: the `File` global doesn't
 * exist on Node 18, but Blob does, and FormData.append(field, blob, filename)
 * sends the filename undici needs.
 */
async function uploadFile(channelId: string, f: MattermostUpload): Promise<string | null> {
  if (!TOKEN) return null
  try {
    const fd = new FormData()
    fd.append('channel_id', channelId)
    fd.append('files', new Blob([f.bytes], { type: f.contentType }), f.filename)
    const res = await fetch(`${BASE}/api/v4/files`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${TOKEN}` },
      body: fd,
      signal: AbortSignal.timeout(20000),
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      console.warn(`[mattermost] upload ${f.filename} -> ${res.status}: ${body.slice(0, 160)}`)
      return null
    }
    const data = (await res.json()) as { file_infos?: { id: string }[] }
    return data.file_infos?.[0]?.id ?? null
  } catch (err) {
    console.warn('[mattermost] file upload failed (non-fatal):', err instanceof Error ? err.message : err)
    return null
  }
}

/**
 * Post a message to the maintenance channel. If opts.rootId is given, the
 * message threads under that post. If opts.files are given, they're uploaded
 * to Mattermost first and attached to the post so the images render inline.
 * Returns the new post id (for storing as a request's thread root), or null on
 * any failure / unconfigured.
 */
export async function postMaintenanceMessage(
  message: string,
  opts: { rootId?: string | null; files?: MattermostUpload[] } = {},
): Promise<string | null> {
  if (!TOKEN) return null
  const channelId = await maintenanceChannelId()
  if (!channelId) {
    console.warn('[mattermost] no maintenance channel id — set MATTERMOST_MAINTENANCE_CHANNEL_ID or MATTERMOST_TEAM')
    return null
  }

  let fileIds: string[] = []
  if (opts.files?.length) {
    const ids = await Promise.all(opts.files.map((f) => uploadFile(channelId, f)))
    fileIds = ids.filter((id): id is string => !!id)
  }

  const post = await api<{ id: string }>('/posts', {
    method: 'POST',
    body: JSON.stringify({
      channel_id: channelId,
      message,
      ...(opts.rootId ? { root_id: opts.rootId } : {}),
      ...(fileIds.length ? { file_ids: fileIds } : {}),
    }),
  })
  return post?.id ?? null
}

// ──────────────────────────────────────────────────────────────
// Status reactions (instead of status messages)
// ──────────────────────────────────────────────────────────────

// Status → Mattermost emoji name (no colons). Only these three statuses get a
// reaction; 'open'/reopen clears them so the root post shows the live status as
// a single emoji.
const STATUS_EMOJI: Record<string, string> = {
  in_progress: 'hammer_and_wrench',
  resolved: 'white_check_mark',
  cancelled: 'no_entry_sign',
}
const ALL_STATUS_EMOJI = Object.values(STATUS_EMOJI)

// The bot's own user id is required to add/remove reactions. Cache it.
let cachedBotUserId: string | null = null
async function botUserId(): Promise<string | null> {
  if (cachedBotUserId) return cachedBotUserId
  const me = await api<{ id: string }>('/users/me')
  cachedBotUserId = me?.id ?? null
  return cachedBotUserId
}

/** Fetch a post (used by the inbound webhook to resolve a reply's thread root). */
export async function getMattermostPost(
  postId: string,
): Promise<{ id: string; root_id: string; user_id: string; message: string } | null> {
  return api(`/posts/${encodeURIComponent(postId)}`)
}

/** The bot's own user id (exported for the inbound webhook's loop guard). */
export async function getBotUserId(): Promise<string | null> {
  return botUserId()
}

/** Quiet reaction call — a 404 when removing a missing reaction is expected. */
async function reactionCall(path: string, method: 'POST' | 'DELETE', body?: object): Promise<void> {
  if (!TOKEN) return
  try {
    await fetch(`${BASE}/api/v4${path}`, {
      method,
      headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(6000),
    })
  } catch {
    /* non-fatal */
  }
}

/**
 * Reflect a request's status on its root post as a single emoji reaction
 * (🛠️ in progress / ✅ resolved / 🚫 cancelled). Clears the other status
 * emojis first so only the current one shows. 'open'/reopen clears all three.
 * Fully non-fatal — never throws.
 */
export async function reactMaintenanceStatus(
  rootId: string | null | undefined,
  status: string,
  opts: { addOwn?: boolean } = {},
): Promise<void> {
  if (!TOKEN || !rootId) return
  const uid = await botUserId()
  if (!uid) return

  const keep = STATUS_EMOJI[status]
  // Remove every status emoji except the one we want to keep.
  for (const emoji of ALL_STATUS_EMOJI) {
    if (emoji === keep) continue
    await reactionCall(`/users/${uid}/posts/${rootId}/reactions/${emoji}`, 'DELETE')
  }
  // Add the bot's own copy of the current status emoji — UNLESS the change was
  // driven by a human's reaction (addOwn: false), in which case their emoji is
  // already there and a second bot copy would just show a count of 2.
  if (keep && opts.addOwn !== false) {
    await reactionCall('/reactions', 'POST', { user_id: uid, post_id: rootId, emoji_name: keep })
  }
}
