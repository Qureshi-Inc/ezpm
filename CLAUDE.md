# CLAUDE.md — EZPM project context

## Project Overview

**EZPM (EZ Property Manager)** — rent-collection platform for a small portfolio of properties. Tenants log in via Zitadel OIDC, save a card or bank account, and Stripe Subscriptions auto-charges them on their monthly due date. Admin manages tenants/properties through a web UI.

Production: https://rent.qureshi.io (Coolify auto-deploy on push to main).

## Technology Stack

- **Frontend:** Next.js 15 (App Router), React 19, TypeScript, Tailwind CSS, shadcn/ui
- **Auth:** Zitadel (https://auth.kainban.com, `ezpm` org) via Auth.js v5 (`next-auth@beta`)
- **Database:** Self-hosted postgres + PostgREST (see `/home/opti3/services/ezpm-db/`). The ezpm app uses `@supabase/supabase-js` against a Caddy-shimmed PostgREST endpoint; zero code changes vs Supabase SaaS.
- **Payments:** Stripe (cards + `us_bank_account`/ACH via Financial Connections), Stripe Subscriptions for monthly auto-charge
- **Deploy:** Coolify on a self-hosted server

## Required Environment Variables

```
# Auth.js v5 + Zitadel
AUTH_SECRET=<openssl rand -base64 32>
AUTH_ZITADEL_ID=<client_id from Zitadel app, e.g. 12345...@ezpm-web>
AUTH_ZITADEL_SECRET=<client_secret from Zitadel app>
AUTH_ZITADEL_ISSUER=https://auth.kainban.com
NEXTAUTH_URL=https://rent.qureshi.io     # prod (or http://localhost:3000 for dev)

# Stripe
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_...

# Self-hosted DB (postgres + PostgREST + Caddy in /home/opti3/services/ezpm-db/)
# The SUPABASE_* names are kept because the JS SDK reads them; the URL points
# at our Caddy shim on the Coolify docker network instead of supabase.co.
NEXT_PUBLIC_SUPABASE_URL=http://ezpm-db-caddy
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...   # JWT signed with JWT_SECRET in ezpm-db/.env, role=anon
SUPABASE_SERVICE_ROLE_KEY=eyJ...        # JWT signed with same secret, role=service_role

# App
NEXT_PUBLIC_APP_URL=https://rent.qureshi.io
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

### Auth
1. User hits `/admin` or `/tenant` → middleware sees no session → redirects to `/api/auth/signin`.
2. Auth.js builds the PKCE authorization URL and redirects to Zitadel.
3. Tenant logs in at `auth.kainban.com` (ezpm org login).
4. Zitadel redirects to `/api/auth/callback/zitadel` with the auth code.
5. Auth.js exchanges code for tokens; the `jwt()` callback calls `lib/provision.ts` → `provision_user_from_zitadel` RPC.
6. RPC takes the advisory lock, inserts the user (admin if first, else tenant), and links the pre-staged `tenants` row by email.
7. Auth.js issues a signed JWE session cookie. Middleware decodes it on every protected request; tenants hitting `/admin` get bounced to `/tenant`.

### Payments
1. Admin creates a tenant in `/admin/tenants/create` (email + property + due day). Admin invites the email separately in Zitadel admin UI.
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
- Instance: `https://auth.kainban.com` (Zitadel v4.15, Login V2)
- Org: `ezpm` (or whatever you named it — see `scripts/zitadel-setup-runbook.md`)
- App: `rent.qureshi.io`, Auth method **CODE** (Authorization Code + PKCE)
- Self-registration: **OFF** (invite-only by design — closes the first-user-becomes-admin exploit)
- Dev mode: ON (allows http://localhost:3000 redirect for local dev — D8 in the eng review)

### Stripe
- Subscriptions are the source of truth for recurring rent. One Customer per tenant, one Subscription per tenant, inline `price_data` so rent updates are single-call.
- API version pinned to `2026-05-27.dahlia` in `lib/stripe-server.ts`. Bump deliberately after testing.
- Webhook endpoint: `/api/webhooks/stripe`. Signature verified via `STRIPE_WEBHOOK_SECRET`.

## Security Notes

- Session cookies are Auth.js v5 JWE (encrypted, signed) — old base64 forgery vector is gone.
- Admin-creation is gated to the FIRST Zitadel-authed user (atomic SQL). Combined with Zitadel self-register being off, this is invite-only end-to-end.
- All payment data is tokenized via Stripe; raw PANs/account numbers never touch the server.
- The webhook handler verifies the Stripe signature before doing anything. Idempotency table prevents replay-induced double-mirrors.

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
