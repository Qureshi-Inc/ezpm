/**
 * EZPM ↔ Mattermost bridge (OPTIONAL).
 *
 * Mattermost outgoing webhooks only fire on ROOT channel messages, never on
 * in-thread replies. To mirror replies typed inside a maintenance request's
 * thread back into the EZPM app, this tiny always-on service holds a WebSocket
 * to Mattermost, watches the maintenance channel for `posted` events that are
 * thread replies, and relays them to the app's inbound endpoint
 * (POST /api/webhooks/mattermost), which maps the thread to a request and
 * stores the comment (and emails the tenant).
 *
 * Skip this entirely if you don't need two-way sync — outbound notifications
 * (app → Mattermost) work without it.
 *
 * Env (see .env.example):
 *   MATTERMOST_URL                    base URL of your Mattermost
 *   MATTERMOST_BOT_TOKEN              bot access token (WS auth + /users/me)
 *   MATTERMOST_MAINTENANCE_CHANNEL_ID channel id to watch (the bot must be a member)
 *   APP_WEBHOOK_URL                   https://<your-app>/api/webhooks/mattermost
 *   MATTERMOST_OUTGOING_TOKEN         shared secret; must equal the app's MATTERMOST_OUTGOING_TOKEN
 *   IGNORE_USERNAMES                  optional, comma-separated (default: matter-bot)
 */

const WebSocket = require('ws')

const BASE = (process.env.MATTERMOST_URL || 'https://your-mattermost.example.com').replace(/\/$/, '')
const TOKEN = process.env.MATTERMOST_BOT_TOKEN
const CHANNEL_ID = process.env.MATTERMOST_MAINTENANCE_CHANNEL_ID
const APP_WEBHOOK_URL = process.env.APP_WEBHOOK_URL
const OUTGOING_TOKEN = process.env.MATTERMOST_OUTGOING_TOKEN
// Usernames whose posts (and any reply that @-mentions them) are kept INTERNAL
// and never mirrored to the tenant — e.g. an AI assistant in the channel.
const IGNORE_USERNAMES = (process.env.IGNORE_USERNAMES || 'matter-bot')
  .split(',')
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean)

const WS_URL = BASE.replace(/^http/, 'ws') + '/api/v4/websocket'

function log(...args) {
  console.log(new Date().toISOString(), ...args)
}

if (!TOKEN || !CHANNEL_ID || !APP_WEBHOOK_URL || !OUTGOING_TOKEN) {
  log('FATAL: missing env (need MATTERMOST_BOT_TOKEN, MATTERMOST_MAINTENANCE_CHANNEL_ID, APP_WEBHOOK_URL, MATTERMOST_OUTGOING_TOKEN)')
  process.exit(1)
}

let botUserId = null
const ignoreUserIds = new Set()

async function resolveBotId() {
  try {
    const res = await fetch(`${BASE}/api/v4/users/me`, { headers: { Authorization: `Bearer ${TOKEN}` } })
    if (res.ok) {
      const me = await res.json()
      botUserId = me.id
      log('bot user id:', botUserId)
    } else {
      log('could not resolve bot id:', res.status)
    }
  } catch (err) {
    log('bot id lookup failed:', err.message)
  }
}

async function resolveIgnoredUsers() {
  for (const name of IGNORE_USERNAMES) {
    try {
      const res = await fetch(`${BASE}/api/v4/users/username/${encodeURIComponent(name)}`, {
        headers: { Authorization: `Bearer ${TOKEN}` },
      })
      if (res.ok) {
        const u = await res.json()
        if (u.id) ignoreUserIds.add(u.id)
      }
    } catch {
      /* ignore */
    }
  }
  log('ignoring usernames:', IGNORE_USERNAMES.join(', ') || '(none)', '| ids:', [...ignoreUserIds].join(', ') || '(none)')
}

/** True if a message @-mentions any ignored username (keeps AI Q&A internal). */
function mentionsIgnored(message) {
  const lower = (message || '').toLowerCase()
  return IGNORE_USERNAMES.some((name) => lower.includes('@' + name))
}

async function relay(post) {
  try {
    const body = new URLSearchParams({
      token: OUTGOING_TOKEN,
      post_id: post.id,
      user_id: post.user_id,
      channel_id: post.channel_id,
      text: post.message || '',
    })
    const res = await fetch(APP_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    })
    log(`relayed reply ${post.id} -> app: HTTP ${res.status}`)
  } catch (err) {
    log('relay failed:', err.message)
  }
}

function handleEvent(msg) {
  if (msg.event !== 'posted') return
  let post
  try {
    post = JSON.parse(msg.data.post)
  } catch {
    return
  }
  // Only thread replies in the maintenance channel, not the bot's own posts.
  if (post.channel_id !== CHANNEL_ID) return
  if (!post.root_id) return // root message, not a reply
  if (botUserId && post.user_id === botUserId) return // loop guard
  if (ignoreUserIds.has(post.user_id)) return // e.g. the AI bot's own posts
  if (!post.message || !post.message.trim()) return
  if (mentionsIgnored(post.message)) return // e.g. "@matter-bot what's this?"
  relay(post)
}

let seq = 1
let reconnectDelay = 1000

function connect() {
  log('connecting to', WS_URL)
  const ws = new WebSocket(WS_URL)

  ws.on('open', () => {
    log('ws open — authenticating')
    ws.send(JSON.stringify({ seq: seq++, action: 'authentication_challenge', data: { token: TOKEN } }))
    reconnectDelay = 1000
  })

  ws.on('message', (raw) => {
    let msg
    try {
      msg = JSON.parse(raw.toString())
    } catch {
      return
    }
    if (msg.event === 'hello') log('authenticated, listening for replies in channel', CHANNEL_ID)
    handleEvent(msg)
  })

  ws.on('close', () => {
    log(`ws closed — reconnecting in ${reconnectDelay}ms`)
    setTimeout(connect, reconnectDelay)
    reconnectDelay = Math.min(reconnectDelay * 2, 30000)
  })

  ws.on('error', (err) => {
    log('ws error:', err.message)
    ws.close()
  })

  // Keepalive ping every 30s.
  const ping = setInterval(() => {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ seq: seq++, action: 'ping' }))
    else clearInterval(ping)
  }, 30000)
}

;(async () => {
  await resolveBotId()
  await resolveIgnoredUsers()
  connect()
})()
