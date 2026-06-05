# CLAUDE.md — EZPM project context

## Project Overview

**EZPM (EZ Property Manager)** — rent-collection platform for a small portfolio of properties. Tenants log in via Zitadel OIDC, save a card or bank account, and Stripe Subscriptions auto-charges them on their monthly due date. Admin manages tenants/properties through a web UI.

Production: https://app.getezpm.com (Coolify auto-deploy on push to main).

## Technology Stack

- **Frontend:** Next.js 15 (App Router), React 19, TypeScript, Tailwind CSS, shadcn/ui
- **Auth:** Zitadel (https://auth.getezpm.com) via Auth.js v5 (`next-auth@beta`). Runs as a standalone docker-compose stack in `/home/opti3/services/ezpm-zitadel/` — NOT a Coolify app, NOT shared with the `services/zitadel` instance at auth.kainban.com.
- **Email (invites + password resets):** Brevo SMTP relay (`smtp-relay.brevo.com:587`). Configured at Zitadel instance level (`/ui/console/instance` → SMTP Provider). Used to deliver Zitadel-templated invite emails to new tenants.
- **Database:** Self-hosted postgres + PostgREST (see `/home/opti3/services/ezpm-db/`). The ezpm app uses `@supabase/supabase-js` against a Caddy-shimmed PostgREST endpoint; zero code changes vs Supabase SaaS.
- **Payments:** Stripe (cards + `us_bank_account`/ACH via Financial Connections), Stripe Subscriptions for monthly auto-charge
- **Deploy:** Coolify on a self-hosted server. Domain `app.getezpm.com` routes through Cloudflare → cloudflared tunnel → Traefik (Coolify proxy on `localhost:443` with self-signed cert + `noTLSVerify`). The standalone Zitadel routes through Cloudflare → cloudflared tunnel → its own Caddy on `localhost:8091`.

## Optional Environment Variables

```
# Mattermost operational notifications (lib/notify.ts) — incoming webhook.
# Fires on: new tenant signup, subscription created, rent charged/failed.
# Leave unset to disable notifications silently (no errors, no-op).
# In Mattermost: Integrations → Incoming Webhooks → Add Webhook → copy URL.
MATTERMOST_WEBHOOK_URL=https://mm.qureshi.io/hooks/<token>

# Mattermost MAINTENANCE channel (lib/mattermost.ts) — bot API, NOT a webhook.
# Used to post one THREAD PER maintenance request, react to status changes with
# an emoji on the root post (🛠️ in_progress / ✅ resolved / 🚫 cancelled), and
# attach the tenant's photos. Threads + reactions need the bot's API token
# (incoming webhooks can't do either):
#   System Console → Integrations → Bot Accounts → ezpm bot → Create Token.
# The bot must be a MEMBER of the channel. Give EITHER the channel id OR the
# team name (channel name defaults to ezpm-maintenance). Unset = no-op.
MATTERMOST_URL=https://mm.qureshi.io
MATTERMOST_BOT_TOKEN=<bot access token>
MATTERMOST_MAINTENANCE_CHANNEL_ID=<26-char channel id>   # OR set MATTERMOST_TEAM instead
# MATTERMOST_TEAM=<team name>
# MATTERMOST_MAINTENANCE_CHANNEL=ezpm-maintenance

# Inbound Mattermost replies (POST /api/webhooks/mattermost). Shared secret the
# mattermost-bridge (see mattermost-bridge/) sends so the app trusts the relay.
# Any non-empty string; must match the bridge's MATTERMOST_OUTGOING_TOKEN.
MATTERMOST_OUTGOING_TOKEN=<shared secret>

# Transactional email (lib/email.ts) — SMTP via nodemailer.
# Receipts, maintenance status/reply emails, and announcement blasts all go
# through here. Uses an SMTP relay (we use Brevo — the same relay Zitadel uses
# for this domain). NOTE: this is the SMTP key (xsmtpsib-...), NOT the HTTP API
# key. Leave SMTP_USER/SMTP_PASS unset to disable all email silently (no-op).
SMTP_HOST=smtp-relay.brevo.com   # default; any SMTP relay works
SMTP_PORT=587                    # 587 STARTTLS (default) or 465 implicit TLS
SMTP_USER=<smtp login>           # Brevo: the SMTP "Login", e.g. xxxxx@smtp-brevo.com
SMTP_PASS=<smtp key>             # falls back to BREVO_API_KEY if unset (back-compat)
EMAIL_FROM_ADDRESS=receipts@getezpm.com   # sender domain must be authenticated in the relay
EMAIL_FROM_NAME=EZPM
EMAIL_REPLY_TO=hello@getezpm.com

# Prometheus metrics endpoint (/api/metrics). Unset = endpoint returns 404.
# Set to a random secret; Prometheus sends it as a Bearer token (or ?token=).
METRICS_TOKEN=<openssl rand -hex 24>

# Transactional SMS (lib/sms.ts) — Twilio for maintenance alerts (manager reply
# + status change). Opt-in per tenant (tenants.notify_sms, default off) and only
# fires if the tenant has a phone on file. Leave any of these unset to disable
# all SMS silently (no-op). Prefer the Messaging Service SID (handles A2P 10DLC).
TWILIO_ACCOUNT_SID=AC...
TWILIO_AUTH_TOKEN=<auth token>
TWILIO_MESSAGING_SERVICE_SID=MG...   # preferred sender
TWILIO_FROM=+1XXXXXXXXXX             # fallback sender if no Messaging Service SID
```

## Required Environment Variables

```
# Auth.js v5 + Zitadel
AUTH_SECRET=<openssl rand -base64 32>
AUTH_TRUST_HOST=true                      # required behind a proxy (Coolify/Traefik/Cloudflare)
AUTH_ZITADEL_ID=<client_id from Zitadel app, e.g. 375245...>
AUTH_ZITADEL_SECRET=<client_secret from Zitadel app>
AUTH_ZITADEL_ISSUER=https://auth.getezpm.com
NEXTAUTH_URL=https://app.getezpm.com      # prod (or http://localhost:3000 for dev)

# Zitadel admin API integration (one-click tenant invites from /admin/tenants/create).
# If unset, tenant creation still works but you have to invite users manually in the
# Zitadel admin UI.
ZITADEL_SERVICE_TOKEN=<PAT for the ezpm-svc machine user — see scripts/zitadel-setup-runbook.md>
ZITADEL_ORG_ID=<numeric Zitadel org id, e.g. 375241717307214595>

# Stripe
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_...

# Self-hosted DB (postgres + PostgREST + Caddy in /home/opti3/services/ezpm-db/)
# The SUPABASE_* names are kept because the JS SDK reads them; the URL points
# at our Caddy shim on the Coolify docker network instead of supabase.co.
NEXT_PUBLIC_SUPABASE_URL=http://ezpm-db-caddy
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...      # JWT signed with JWT_SECRET in ezpm-db/.env, role=anon
SUPABASE_SERVICE_ROLE_KEY=eyJ...          # JWT signed with same secret, role=service_role

# App
NEXT_PUBLIC_APP_URL=https://app.getezpm.com

# Maintenance attachments (photos) storage — disk volume.
# Mount a persistent Coolify volume at this path; files are written here and
# served ONLY through the ownership-checked /api/.../maintenance/attachments/[id]
# route (never a public URL). Auto-discovered by the nightly backup.
UPLOADS_DIR=/app/uploads
```

## Tenant-facing features

All of these are independent of the Stripe payment flow (no shared code paths,
webhooks, or settings) — safe to touch without risking payments.

### Maintenance requests (Phase 1 + Phase 2)
- Tenants report issues (title + category + priority + description + photos);
  admin moves status `open → in_progress → resolved → cancelled`.
- **Mattermost:** new request → one THREAD PER request (root post id stored on
  `maintenance_requests.mattermost_root_id`) with the tenant's photos attached.
  Status changes **react** on the root post with a single emoji (🛠️/✅/🚫) —
  the prior status emoji is cleared so it always shows the live status. React
  with 🛠️/✅/🚫 in Mattermost to drive the status (relayed by the bridge).
- **Two-way updates thread (Phase 2):** `maintenance_comments` table + a chat UI
  (`MaintenanceThread`) on both detail pages. Comments post to the request's
  Mattermost thread; **replies in Mattermost flow back as comments** via the
  bridge (see "Two-way Mattermost sync" below). Comment photos attach via
  `maintenance_attachments.comment_id`.
- **Emails:** status change → branded status email; an admin reply → branded
  reply email with the message + a "View & reply" link (respects the tenant's
  notification toggle). All share `emailLayout()` with the receipt.
- Tables: `maintenance_requests`, `maintenance_attachments` (+ `comment_id`),
  `maintenance_comments`. Photos on the `UPLOADS_DIR` volume, served through an
  ownership-checked route (never a public URL). File security is covered by
  `lib/storage.test.ts` (`npm test`).

### Documents (`documents` table)
Per-tenant document folder, **bidirectional**: both tenant and admin upload into
the same folder and both see everything (labeled by uploader). Uploader deletes
own; admin deletes any. Tenant page `/tenant/documents`; admin manages from the
tenant-detail page (shared `DocumentsManager` component). PDF/images/Office/
txt/csv up to 25 MB, stored on the SAME `UPLOADS_DIR` volume under `documents/`,
served via an ownership-checked route. Reuses `lib/storage` (`storeDocument`).

### Announcements (`announcements` table)
Admin posts a notice (`/admin/announcements`) optionally emailing every tenant.
Tenants see the latest on their dashboard banner + a full list at
`/tenant/announcements`.

### Tenant notification preferences
Per-tenant email toggles (default true) on `/tenant/settings`
(`NotificationSettings`) via `PATCH /api/tenant/notifications`:
- `notify_maintenance_replies` — honored by `lib/maintenance-notify.ts`.
- `notify_maintenance_status` — honored by `applyMaintenanceStatus` in
  `lib/maintenance-status.ts`.
- `notify_payment_receipts` — honored by `sendReceiptEmailForInvoice` in
  `lib/stripe-event-handler.ts`.
Structured so adding more toggles is one boolean column + one row in the UI.

### Status changes are bidirectional
`lib/maintenance-status.ts` `applyMaintenanceStatus()` is the single path for a
status change (DB update + tenant email/SMS + Mattermost emoji reaction).
Triggered by:
- the admin web UI (`PATCH /api/admin/maintenance/[id]`),
- tenant self-cancel (`PATCH /api/tenant/maintenance/[id]`), or
- a **status emoji reaction in Mattermost** on the request's root post — the
  bridge catches `reaction_added` (🛠️→in_progress, ✅→resolved, 🚫→cancelled)
  and relays to `POST /api/webhooks/mattermost-reaction`. (No emoji maps to
  `open`; reopen via the web UI. `reaction_removed` is ignored — ambiguous.)

### Admin analytics dashboard + metrics
`/admin` shows KPI cards + charts (rent collected, payments succeeded/failed,
tenant growth, maintenance created/resolved) with a timeframe selector
(1M/3M/6M/1Y/2Y/Max). `components/admin/AnalyticsDashboard.tsx` (Recharts) fetches
`GET /api/admin/metrics?range=…`. All aggregation lives in `lib/metrics.ts`
(`getDashboardMetrics` for the dashboard, `getBusinessSnapshot` for gauges) —
JS reducers over windowed rows; swap for SQL RPCs if it ever needs scale.

**Prometheus / Grafana:** `GET /api/metrics` emits the business gauges in
Prometheus text format, token-guarded by `METRICS_TOKEN` (Bearer or `?token=`;
404 when unset). Point Prometheus at it (`metrics_path: /api/metrics`), graph in
Grafana. Runtime/perf metrics (HTTP latency histograms, error rates) are the
documented next step: add `prom-client`, register default + histogram metrics,
and merge `register.metrics()` into the same endpoint so the scrape config never
changes.

### Admin "Send Password Reset"
`/admin/tenants/[id]` → emails the tenant a Zitadel password-reset link
(`lib/zitadel.ts` `sendPasswordReset` → `POST /v2/users/{id}/password_reset`).
Replaced the dead bcrypt-era "Force Password Change" button.

**Coolify setup before deploy:** add ONE persistent volume mounted at
`/app/uploads` (covers BOTH maintenance photos and documents; or set
`UPLOADS_DIR`). Without it, uploaded files are lost on redeploy.

## Two-way Mattermost sync (mattermost-bridge/) — INSTANCE-SPECIFIC

Outbound (app → Mattermost) uses the bot API and works anywhere. **Inbound**
(Mattermost reply → app comment) is the tricky half:

- Mattermost **outgoing webhooks only fire on root channel messages, never on
  in-thread replies** — so they can't drive a per-request thread conversation.
- Solution: a tiny always-on **WebSocket bridge** (`mattermost-bridge/`) that
  authenticates with the bot token, listens for `posted` events in the channel,
  and relays in-thread replies to `POST /api/webhooks/mattermost` (authenticated
  with `MATTERMOST_OUTGOING_TOKEN`). The app maps the reply's `root_id` → request
  and inserts a "Property manager" comment + emails the tenant.
- Loop-safe: ignores the bot's own posts; `IGNORE_USERNAMES` (default
  `matter-bot`) drops an AI assistant's posts AND any reply that @-mentions it,
  so internal AI Q&A stays private; dedupes by `mattermost_comments`'
  `mattermost_post_id` (UNIQUE).
- The channel can be **private** with the bridge (the bot is a member). The
  outgoing-webhook path required a public channel; the bridge does not.
- Live deployment runs as a standalone docker-compose service at
  `/home/opti3/services/ezpm-mm-bridge/` (NOT in this repo's deploy; secrets in
  its own `.env`). A portable copy of the code lives in `mattermost-bridge/`.

## Database Schema (`supabase/schema.sql`)

- `users` — Zitadel-authenticated user. `zitadel_subject` (the OIDC `sub` claim) is the durable key. Roles: `admin`, `tenant`. **First user to log in via Zitadel becomes admin** (atomic via the `provision_user_from_zitadel` postgres function + `pg_advisory_xact_lock`).
- `tenants` — pre-staged by admin before the tenant first logs in. `email` is the linkage key; `user_id` stays NULL until the tenant accepts the Zitadel invite and logs in. `stripe_customer_id` + `stripe_subscription_id` hold the Stripe references.
- `properties` — rental units. `rent_amount` drives the Stripe Subscription price.
- `payment_methods` — local mirror of Stripe PaymentMethods (`card` or `us_bank_account`). Source of truth is Stripe.
- `payments` — local mirror of Stripe Invoices. Webhook-driven. Status values mirror Stripe Invoice states: `open`, `processing`, `succeeded`, `failed`, `uncollectible`, `void`.
- `stripe_events` — idempotency table. Webhook handler INSERTs every `event.id` with `ON CONFLICT DO NOTHING` so Stripe retries don't double-mirror.
- `system_settings` — bootstrap flags and the reconcile watermark (`last_stripe_event_synced_at`).
- `maintenance_requests` / `maintenance_attachments` — issues + photo/PDF files (file metadata only; bytes on `UPLOADS_DIR`). `mattermost_root_id` links the Mattermost thread; `maintenance_attachments.comment_id` ties a photo to a thread comment.
- `maintenance_comments` — two-way request thread (tenant/admin). `mattermost_post_id` (UNIQUE) dedupes replies mirrored in from Mattermost.
- `documents` — per-tenant bidirectional document folder (file metadata; bytes on `UPLOADS_DIR` under `documents/`).
- `announcements` — admin → tenant notices.
- `tenants.notify_maintenance_replies`, `tenants.notify_maintenance_status`, `tenants.notify_payment_receipts` — per-tenant email toggles (default true; tenant Settings page).

## Key Flows

### Auth — sign-in
1. User hits `/admin` or `/tenant` → middleware sees no session → redirects to `/auth/start` (NOT `/api/auth/signin`, which is Auth.js's default page with a "Sign in with Zitadel" button — adds a confusing extra click).
2. `/auth/start` calls `signIn('zitadel', { redirectTo: callbackUrl }, { login_hint })` server-side. Auth.js builds the PKCE authorize URL and the route handler returns a 302 to Zitadel.
3. User logs in at `auth.getezpm.com` (Zitadel V2 hosted login UI). If they have a fresh Zitadel session (e.g. just finished an invite), this silent-SSOs.
4. Zitadel redirects to `/api/auth/callback/zitadel` with the auth code.
5. Auth.js exchanges code for tokens; the `jwt()` callback calls `lib/provision.ts` → `provision_user_from_zitadel` RPC. The `id_token` is also stashed in the JWT for federated logout.
6. RPC takes the advisory lock, looks up by `zitadel_subject` (fast path), falls back to email match (handles Zitadel-instance migrations — see the `Zitadel-migration safety net` comment in `supabase/schema.sql`), inserts the user (admin if first, else tenant), and links the pre-staged `tenants` row by email.
7. Auth.js issues a signed JWE session cookie. Middleware decodes it on every protected request; tenants hitting `/admin` get bounced to `/tenant`.

### Auth — sign-out (federated)
1. User clicks Logout (top-right nav) → browser navigates to `/auth/signout`.
2. `/auth/signout` route handler reads `id_token` from the JWT, calls `signOut({ redirect: false })` to clear our Auth.js cookies, then returns a 302 to Zitadel's `end_session_endpoint` with `id_token_hint` + `post_logout_redirect_uri=https://app.getezpm.com`.
3. Zitadel terminates its session and redirects back to `app.getezpm.com`.
4. Home page → `/auth/start` → OIDC authorize → Zitadel has no session anymore → shows login form (instead of silent-SSO'ing the user back in).

Without federated logout, the Auth.js-only signout would clear our cookie but the still-alive Zitadel session would silent-SSO the user right back in. The Logout button would look like a no-op.

### Tenant invite (one-click from admin)
1. Admin submits `/admin/tenants/create` with email + property + due day.
2. `app/api/admin/tenants/route.ts` saves the tenant row, then (if `ZITADEL_SERVICE_TOKEN` + `ZITADEL_ORG_ID` are set) calls `zitadel.createHumanUser` + `zitadel.sendInvitation` using the `ezpm-svc` PAT.
3. Zitadel generates an invite code, fills in the standard email template, and ships it via Brevo SMTP. Tenant gets an email with a clickable link to `auth.getezpm.com/ui/v2/login/verify?code=...&userId=...&invite=true`.
4. Tenant clicks → code is pre-filled in the verify form → click Continue → set password (Zitadel hosted UI, your org's password policy applied).
5. Zitadel creates a session for the tenant and redirects to the OIDC app's **Default Redirect URI** (currently `https://app.getezpm.com`). This is configured on the Zitadel OIDC app — without it, Zitadel dumps the tenant on its own console after invite completion.
6. Tenant lands at `app.getezpm.com` → home → `/auth/start` → OIDC silent-SSOs via the fresh Zitadel session → callback → first sign-in → provision row → `/tenant`.

### Payments
1. Admin creates a tenant in `/admin/tenants/create` (email + property + due day). Zitadel user + invite email auto-handled (see Tenant invite flow above).
2. Tenant logs in. Visits `/tenant/payment-methods/add`. Server creates a Stripe SetupIntent (with Financial Connections for ACH). Client uses PaymentElement to attach a card or bank account.
3. On successful attach, the server creates the Stripe Subscription (one-time, when the first PM is added AND the tenant has a property assigned). Stripe Subscriptions takes over.
4. Each month, Stripe creates an Invoice and auto-charges the default PM on `payment_due_day`. Webhook events (`invoice.created`, `invoice.payment_succeeded`, etc.) flow into `/api/webhooks/stripe` and update the local `payments` mirror.
5. If a charge fails, tenant sees the failed invoice in `/tenant/pay` and can retry with a different PM via `stripe.invoices.pay()`.

### Outage recovery
- Stripe retries webhooks for 3 days. If the server is down longer, run `npm run reconcile-stripe` (or the admin "Run Stripe Reconcile" button). It walks `stripe.events.list({ created: { gt: watermark }})` and replays through the same handler.

## Development Commands

- `npm run dev` — local dev server (`http://localhost:3000`)
- `npm run build` — production build
- `npm run lint` — lint
- `npm run reconcile-stripe` — manual Stripe events catchup (use `-- --dry-run` to preview)

## Key Integrations

### Zitadel
- Instance: `https://auth.getezpm.com` (Zitadel v4.15, Login V2). Dedicated to EZPM — NOT the shared `auth.kainban.com` instance.
- Stack: `/home/opti3/services/ezpm-zitadel/docker-compose.yml` (postgres + zitadel-api + zitadel-login + Caddy on host port `8091`).
- Org: `EZPM` (numeric id in `ZITADEL_ORG_ID` env var). Org members in this org map to EZPM users.
- Project: `EZPM` containing the `app.getezpm.com` OIDC app.
- OIDC app config (must all be set in Zitadel admin UI):
  - Auth method: **CODE** (Authorization Code + PKCE).
  - Redirect URIs: `http://localhost:3000/api/auth/callback/zitadel`, `https://app.getezpm.com/api/auth/callback/zitadel`.
  - Post Logout Redirect URIs: `http://localhost:3000`, `https://app.getezpm.com` (required for `/auth/signout` federated logout to land back on our app instead of a Zitadel page).
  - Default Redirect URI: `https://app.getezpm.com` (required for tenant invite completion to redirect back to our app instead of Zitadel console).
  - Dev mode: ON (required to allow `http://localhost:3000` URLs).
- Self-registration: **OFF** (invite-only by design — closes the first-user-becomes-admin exploit).
- SMTP: Brevo, configured at instance level (`/ui/console/instance` → SMTP Provider). Sender `admin@getezpm.com`. Domain authentication (SPF/DKIM for `getezpm.com`) is the deliverability fix when invites land in spam — set up in Brevo → Senders & IP → Domains.
- Service user: `ezpm-svc` (machine user) with `ORG_OWNER` membership on the EZPM org. Its PAT is in `ZITADEL_SERVICE_TOKEN`. Used by `lib/zitadel.ts` for auto-invite. See `scripts/zitadel-setup-runbook.md`.

### Stripe
- Subscriptions are the source of truth for recurring rent. One Customer per tenant, one Subscription per tenant, inline `price_data` so rent updates are single-call.
- API version pinned to `2026-05-27.dahlia` in `lib/stripe-server.ts`. Bump deliberately after testing.
- Webhook endpoint: `/api/webhooks/stripe`. Signature verified via `STRIPE_WEBHOOK_SECRET`.

## Security Notes

- Session cookies are Auth.js v5 JWE (encrypted, signed) — old base64 forgery vector is gone.
- Logout is **federated** via `/auth/signout`: clears both our cookie AND Zitadel's session via `end_session_endpoint` with `id_token_hint`. Without federation, the still-alive Zitadel session would silent-SSO the user right back in on the next page load.
- Admin-creation is gated to the FIRST Zitadel-authed user (atomic SQL). Combined with Zitadel self-register being off, this is invite-only end-to-end.
- The `provision_user_from_zitadel` RPC has a Zitadel-migration safety net: if `zitadel_subject` lookup misses but email matches an existing user, it re-binds the existing row to the new subject. Trust model is "email-as-identity within a single Zitadel org" — safe because Zitadel enforces email uniqueness per org.
- All payment data is tokenized via Stripe; raw PANs/account numbers never touch the server.
- The webhook handler verifies the Stripe signature before doing anything. Idempotency table prevents replay-induced double-mirrors.
- `ZITADEL_SERVICE_TOKEN` is an admin-level credential (the `ezpm-svc` PAT with `ORG_OWNER` on the EZPM org). Treat it like a root password — Coolify env vars only, never commit, never log. If it leaks, rotate it in Zitadel admin → Users → ezpm-svc → Personal Access Tokens.

## Deferred (post-cutover follow-ups)

See the migration plan for the full list. The big ones:

- **T12** — handle `charge.failed` (ACH bounce 1-7 days post-success), `invoice.marked_uncollectible`, and `charge.dispute.created` webhooks. Today, a bounced ACH still shows as `succeeded` until manually reconciled.
- **T13** — `pg_dump` + documented rollback procedure for the schema cutover (see `MIGRATION.md`).
- **T14** — introduce Vitest + Playwright. Zero tests today.
- **T15** — enforce MFA on the Zitadel admin role.

## Session handoff (current state — read me first when resuming)

Work is on the **`mattermost` branch, NOT yet pushed** (`git push origin mattermost`
when ready). The branch adds, on top of the Zitadel/Stripe migration:
maintenance Phase 1 + Phase 2 thread, Mattermost threading/photos/emoji-status/
two-way bridge, documents, announcements, tenant notification prefs, admin
Zitadel password reset, SMTP email, and mobile layout fixes.

Live-environment state already applied (so don't redo these):
- DB tables created on the live DB + PostgREST schema reloaded: `documents`,
  `announcements`, `maintenance_comments`, `maintenance_attachments.comment_id`,
  `tenants.notify_maintenance_replies`, `tenants.notify_payment_receipts`,
  `tenants.notify_sms`, `maintenance_comments.mattermost_post_id`.
- Coolify env on the app: `SMTP_USER=...@smtp-brevo.com` set; `BREVO_API_KEY`
  holds the SMTP key (reused as `SMTP_PASS`); `MATTERMOST_OUTGOING_TOKEN` set.
- Coolify persistent volume mounted at `/app/uploads` (maintenance + documents).
- The **bridge** runs at `/home/opti3/services/ezpm-mm-bridge/` (docker compose,
  `restart: unless-stopped`, Homepage card under Infrastructure).
- Email verified working over Brevo SMTP (HTTP API key was the wrong key type).
- Maintenance channel `maint-requests` can be private (bridge handles inbound).

Pending / nice-to-have:
- Push the `mattermost` branch → redeploy to ship the app commits.
- Rotate the Brevo SMTP key (was pasted in plaintext during setup).
- GitHub Pages landing (`docs/index.html`) builds from a different branch — merge
  there to publish the updated feature cards.

## Open-source portability

This repo is AGPLv3 and public. Notes for other operators:

**Portable as-is (config-only, no code specific to our instance):**
- Core app (auth, payments, maintenance, documents, announcements, notification
  prefs). All integrations are env-gated and no-op when unset.
- Email: any SMTP relay via `SMTP_*` (we use Brevo; Mailgun/SES/Postfix all work).
- Mattermost OUTBOUND notifications (`lib/notify.ts` incoming webhook +
  `lib/mattermost.ts` bot API): set the env vars or leave unset to disable.

**Instance-specific — needs the operator's own setup (not a code change):**
- Zitadel (`auth.getezpm.com`), Stripe keys, Brevo creds, all IDs (org id,
  channel id, OIDC client) — every one is an env var; nothing hardcoded.
- The **two-way Mattermost bridge** is the only piece that needs an extra
  always-on process. It's shipped in `mattermost-bridge/` with a
  `docker-compose.example.yml` + `.env.example` so any operator can run it
  (or skip it — outbound notifications still work without it). `IGNORE_USERNAMES`
  is configurable; nothing about our AI bot is hardcoded.

**To make a feature more portable when extending:** keep integrations behind an
`isConfigured()`-style guard that returns a silent no-op when env is missing
(see `lib/mattermost.ts`, `lib/email.ts`), and never hardcode IDs/usernames —
read them from env with sensible defaults.

## Skill routing

When the user's request matches an available skill, invoke it via the Skill tool. When in doubt, invoke the skill.

Key routing rules:
- Architecture review → invoke /plan-eng-review
- Bugs/errors → invoke /investigate
- QA/testing site behavior → invoke /qa or /qa-only
- Code review/diff check → invoke /review
- Ship/deploy/PR → invoke /ship or /land-and-deploy
- Save progress → invoke /context-save
- Resume context → invoke /context-restore
