# EZPM ↔ Mattermost bridge (optional)

Mirrors **in-thread Mattermost replies** on a maintenance request back into the
EZPM app as comments (and emails the tenant). This is the **inbound** half of
two-way sync. Outbound (app → Mattermost notifications) works without this
service — only run the bridge if you want staff to reply from Mattermost.

## Why a separate service?

Mattermost **outgoing webhooks only fire on root channel messages, never on
in-thread replies**, so they can't drive a per-request thread conversation. This
bridge instead holds a WebSocket to Mattermost (authenticated as your bot),
catches `posted` events that are thread replies, and relays them to the app's
`POST /api/webhooks/mattermost` endpoint. Because it uses the bot token, the
maintenance channel can stay **private**.

## Prerequisites

1. A Mattermost **bot account** with an access token, added as a **member** of
   your maintenance channel.
2. On the EZPM app, set `MATTERMOST_OUTGOING_TOKEN` to a shared secret.
3. The app's outbound Mattermost vars configured (`MATTERMOST_BOT_TOKEN`,
   `MATTERMOST_MAINTENANCE_CHANNEL_ID`) so requests create threads to reply to.

## Run

```bash
cp .env.example .env          # fill in your values
cp docker-compose.example.yml docker-compose.yml
docker compose up -d --build
docker compose logs -f        # expect: "authenticated, listening for replies in channel ..."
```

`MATTERMOST_OUTGOING_TOKEN` here **must equal** the app's `MATTERMOST_OUTGOING_TOKEN`.

## Two-way status (emoji reactions)

The bridge also catches `reaction_added` on a request's root post and relays a
**status emoji** to `POST /api/webhooks/mattermost-reaction` (derived from
`APP_WEBHOOK_URL`, or override with `APP_REACTION_URL`):
🛠️ `hammer_and_wrench` → in progress, ✅ `white_check_mark` → resolved,
🚫 `no_entry_sign` → cancelled. The app updates the request and emails the
tenant — same as changing status in the web UI. (No emoji maps to "open";
`reaction_removed` is ignored.)

## Behavior / safety

- Only mirrors **thread replies** in the configured channel (root messages and
  other channels are ignored).
- Status emoji reactions drive status changes; the bot's own reactions are
  ignored (loop guard).
- Ignores the bot's own posts (loop guard) and dedupes by Mattermost post id
  (the app enforces a UNIQUE `mattermost_post_id`).
- `IGNORE_USERNAMES` (default `matter-bot`) drops posts **from** those users and
  any reply that **@-mentions** them — so internal AI/assistant Q&A in the thread
  never reaches the tenant.
- Stateless; `restart: unless-stopped` keeps it up across reboots.
