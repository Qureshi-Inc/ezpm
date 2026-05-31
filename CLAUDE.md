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
# Mattermost operational notifications (lib/notify.ts)
# Fires on: new tenant signup, subscription created, rent charged/failed.
# Leave unset to disable notifications silently (no errors, no-op).
# Bot: 54doh4cy7ig8fpphwtqfw3h98c on mm.qureshi.io
# In Mattermost: Integrations → Incoming Webhooks → Add Webhook → copy URL.
MATTERMOST_WEBHOOK_URL=https://mm.qureshi.io/hooks/<token>

# Branded tenant receipt emails (lib/email.ts)
# Sent automatically on every successful payment (invoice.payment_succeeded).
# Uses Brevo's HTTP transactional API (NOT the SMTP key Zitadel uses — this is
# a separate API key from Brevo → SMTP & API → API Keys, format xkeysib-...).
# Leave BREVO_API_KEY unset to disable receipts silently (no errors, no-op).
# Preview the template: npx tsx scripts/preview-receipt.ts → open
# email-templates/receipt-preview.html.
BREVO_API_KEY=xkeysib-...
EMAIL_FROM_ADDRESS=receipts@getezpm.com   # must be a verified Brevo sender/domain
EMAIL_FROM_NAME=EZPM
EMAIL_REPLY_TO=hello@getezpm.com
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
```

## Database Schema (`supabase/schema.sql`)

- `users` — Zitadel-authenticated user. `zitadel_subject` (the OIDC `sub` claim) is the durable key. Roles: `admin`, `tenant`. **First user to log in via Zitadel becomes admin** (atomic via the `provision_user_from_zitadel` postgres function + `pg_advisory_xact_lock`).
- `tenants` — pre-staged by admin before the tenant first logs in. `email` is the linkage key; `user_id` stays NULL until the tenant accepts the Zitadel invite and logs in. `stripe_customer_id` + `stripe_subscription_id` hold the Stripe references.
- `properties` — rental units. `rent_amount` drives the Stripe Subscription price.
- `payment_methods` — local mirror of Stripe PaymentMethods (`card` or `us_bank_account`). Source of truth is Stripe.
- `payments` — local mirror of Stripe Invoices. Webhook-driven. Status values mirror Stripe Invoice states: `open`, `processing`, `succeeded`, `failed`, `uncollectible`, `void`.
- `stripe_events` — idempotency table. Webhook handler INSERTs every `event.id` with `ON CONFLICT DO NOTHING` so Stripe retries don't double-mirror.
- `system_settings` — bootstrap flags and the reconcile watermark (`last_stripe_event_synced_at`).

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
