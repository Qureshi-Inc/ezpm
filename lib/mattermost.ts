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
// Public base URL the Mattermost server calls back when a status button is
// clicked, and the shared secret we embed in each button's context to
// authenticate that callback (button POSTs don't carry the webhook token).
const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || 'https://app.getezpm.com').replace(/\/$/, '')
const ACTION_SECRET = process.env.MATTERMOST_ACTION_SECRET || ''

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
    // Cast to BlobPart: TS 5.7+/newer DOM libs type Uint8Array as
    // Uint8Array<ArrayBufferLike>, which isn't directly assignable to BlobPart.
    fd.append('files', new Blob([f.bytes as BlobPart], { type: f.contentType }), f.filename)
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
  opts: { rootId?: string | null; files?: MattermostUpload[]; attachments?: object[] } = {},
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
      ...(opts.attachments?.length ? { props: { attachments: opts.attachments } } : {}),
    }),
  })
  return post?.id ?? null
}

// The bot's own user id is required by the inbound reply webhook's loop guard.
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

// ──────────────────────────────────────────────────────────────
// Status buttons (interactive message — replaces emoji reactions)
// ──────────────────────────────────────────────────────────────

interface StatusMeta {
  label: string
  emoji: string
  /** Mattermost message-button style applied only to the CURRENT status. */
  style?: 'primary' | 'success' | 'danger'
  color: string
}
const STATUS_META: Record<string, StatusMeta> = {
  open: { label: 'Open', emoji: '🆕', color: '#eab308' },
  in_progress: { label: 'In progress', emoji: '🛠️', style: 'primary', color: '#3b82f6' },
  resolved: { label: 'Resolved', emoji: '✅', style: 'success', color: '#22c55e' },
  cancelled: { label: 'Cancelled', emoji: '🚫', style: 'danger', color: '#ef4444' },
}
const STATUS_ORDER = ['open', 'in_progress', 'resolved', 'cancelled'] as const

/**
 * Build the interactive status-button attachment for a request's root post.
 * The CURRENT status is marked with a check and colored; clicking any button
 * POSTs to /api/webhooks/mattermost-action with a secret-bearing context.
 * Re-rendered (via updateMaintenanceStatusPost) whenever the status changes,
 * from any source, so the post always shows the live status.
 */
export function statusButtonsAttachment(requestId: string, current: string): object {
  const meta = STATUS_META[current] ?? STATUS_META.open
  const actions = STATUS_ORDER.map((s) => {
    const m = STATUS_META[s]
    const isCurrent = s === current
    return {
      id: `set_${s}`,
      // `type` is REQUIRED by Mattermost; without it the action is rejected as
      // invalid and clicks 404.
      type: 'button',
      // Each button is colored by its status (blue/green/red; open stays neutral).
      // The CURRENT status is marked with a ✓ so it's obvious at a glance.
      name: `${m.emoji} ${m.label}${isCurrent ? ' ✓' : ''}`,
      ...(m.style ? { style: m.style } : {}),
      integration: {
        url: `${APP_URL}/api/webhooks/mattermost-action`,
        context: { requestId, status: s, secret: ACTION_SECRET },
      },
    }
  })
  return {
    color: meta.color,
    text: `**Status:** ${meta.emoji} ${meta.label}`,
    actions,
  }
}

/**
 * A separate, darker-barred "Reply to tenant" button. Mattermost action buttons
 * can't be plain hyperlinks, so clicking it calls the action endpoint, which
 * replies (ephemerally, to the clicker) with a permalink that jumps straight to
 * this request's thread.
 */
export function replyButtonAttachment(requestId: string): object {
  return {
    color: '#0f172a', // dark slate bar to set the reply action apart from status
    actions: [
      {
        id: 'open_thread',
        type: 'button',
        name: '💬 Reply to tenant',
        style: 'primary',
        integration: {
          url: `${APP_URL}/api/webhooks/mattermost-action`,
          context: { requestId, action: 'reply', secret: ACTION_SECRET },
        },
      },
    ],
  }
}

/** The full set of root-post attachments: status buttons + the reply button. */
export function maintenanceRootAttachments(requestId: string, status: string): object[] {
  return [statusButtonsAttachment(requestId, status), replyButtonAttachment(requestId)]
}

/**
 * Re-render a request's root post to reflect `status` on its status buttons
 * (and re-assert the reply button). Used by every status-change path (web UI,
 * button click, tenant cancel, legacy emoji) so the Mattermost thread always
 * shows the live status. Fully non-fatal — never throws.
 */
export async function updateMaintenanceStatusPost(
  rootId: string | null | undefined,
  requestId: string,
  status: string,
): Promise<void> {
  if (!TOKEN || !rootId) return
  await api(`/posts/${encodeURIComponent(rootId)}/patch`, {
    method: 'PUT',
    body: JSON.stringify({ props: { attachments: maintenanceRootAttachments(requestId, status) } }),
  })
}
