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

/**
 * Post a message to the maintenance channel. If rootId is given, the message
 * threads under that post. Returns the new post id (for storing as a request's
 * thread root), or null on any failure / unconfigured.
 */
export async function postMaintenanceMessage(
  message: string,
  rootId?: string | null,
): Promise<string | null> {
  if (!TOKEN) return null
  const channelId = await maintenanceChannelId()
  if (!channelId) {
    console.warn('[mattermost] no maintenance channel id — set MATTERMOST_MAINTENANCE_CHANNEL_ID or MATTERMOST_TEAM')
    return null
  }
  const post = await api<{ id: string }>('/posts', {
    method: 'POST',
    body: JSON.stringify({
      channel_id: channelId,
      message,
      ...(rootId ? { root_id: rootId } : {}),
    }),
  })
  return post?.id ?? null
}
