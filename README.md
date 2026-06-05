# EZPM — EZ Property Manager

Self-hosted rent collection for small landlords. Tenants log in, save a card or bank account, and get charged automatically every month. You manage tenants, properties, maintenance, and documents from one admin UI. No SaaS middleman, no per-unit fees.

Production: **https://app.getezpm.com** · Marketing: **https://getezpm.com** · License: **AGPLv3**

> Built on Stripe (cards + ACH), Zitadel (OIDC auth), and a self-hosted Postgres. Every third-party integration is optional and turns itself off when you leave its keys unset.

---

## What it does

**For tenants**
- **Auto-pay rent** with a saved card or US bank account (ACH). Stripe Subscriptions charges them on their due day; failed charges can be retried with another method.
- **Email receipts** on every successful payment.
- **Report maintenance issues** with photos, then follow status (open → in progress → resolved) and chat with the manager in a per-request thread.
- **Documents** folder shared with the manager (renters insurance, proof of income, lease, notices).
- **Announcements** on the dashboard.
- **Notification settings** to opt out of specific emails.

**For the landlord (admin)**
- Pre-stage tenants and send **one-click Zitadel invites**.
- Assign properties, set the monthly rent and due day; the Stripe Subscription follows.
- Track every maintenance request, change status, reply (emails the tenant), and share documents.
- Post announcements, trigger a tenant **password reset**, and reconcile Stripe after downtime.

**Optional ops integration (Mattermost)**
- New signups, subscriptions, charges, and failures post to a channel.
- Each maintenance request becomes its own thread with the tenant's photos; status shows as a single emoji reaction (🛠️ / ✅ / 🚫).
- A small [bridge service](./mattermost-bridge/) lets your team reply **inside the thread** and have it land in the app as a comment plus an email to the tenant.

---

## Architecture

```
        Tenant / Admin browser
                │ HTTPS
                ▼
   Cloudflare ──tunnel──▶ Traefik (Coolify) ──▶ Next.js 15 app  (app.getezpm.com)
                                                      │
        ┌──────────────┬───────────────┬─────────────┼──────────────┬───────────────┐
        ▼              ▼               ▼             ▼              ▼               ▼
   Zitadel OIDC    Stripe API     PostgREST +     SMTP relay    Mattermost     Disk volume
 (auth.getezpm)  (Subscriptions)   Postgres       (email)       (bot + bridge)  (UPLOADS_DIR:
   Auth.js v5     webhooks ▶ app   via JS SDK     nodemailer    notify/threads  photos + docs)
```

- **Auth** is OIDC against a dedicated Zitadel instance. The first user to log in becomes admin (atomic SQL lock); self-registration is off, so the platform is invite-only.
- **Payments** live in Stripe. The local `payments` table is a mirror kept in sync by signed webhooks with an idempotency table so retries never double-count.
- **Data** is plain Postgres reached through PostgREST. The app uses `@supabase/supabase-js` against a Caddy-shimmed endpoint, so the code is identical whether you point it at Supabase SaaS or your own box.
- **Files** (maintenance photos, documents) are written to a mounted disk volume and served only through ownership-checked routes. There are no public file URLs.

Full design, key flows, and the security model are in **[CLAUDE.md](./CLAUDE.md)**.

---

## Tech stack

| Layer | Choice |
|---|---|
| Web | Next.js 15 (App Router), React 19, TypeScript, Tailwind, shadcn/ui |
| Auth | Auth.js v5 (`next-auth@beta`) + Zitadel OIDC |
| Payments | Stripe (cards + `us_bank_account` via Financial Connections), Subscriptions |
| Data | Postgres + PostgREST (Supabase JS client; Supabase SaaS also works) |
| Email | Any SMTP relay via `nodemailer` (we use Brevo) |
| Notifications | Mattermost bot API + optional WebSocket bridge |
| Deploy | Coolify on a self-hosted server, behind Cloudflare |
| Tests | Vitest (file-storage security suite) |

---

## Quick start (local dev)

```bash
git clone git@github.com:Qureshi-Inc/ezpm.git
cd ezpm
npm install
cp .env.example .env.local   # fill in your keys — see Configuration below
npm run dev                  # http://localhost:3000
```

To run against the same Zitadel + Stripe as prod:
- Register `http://localhost:3000/api/auth/callback/zitadel` as a redirect URI on your Zitadel OIDC app and enable dev mode (see [`scripts/zitadel-setup-runbook.md`](./scripts/zitadel-setup-runbook.md)).
- Use Stripe **test** keys (`sk_test_…`, `pk_test_…`).

---

## Configuration

Set these as environment variables (Coolify in prod, `.env.local` for dev). The full annotated list lives in [CLAUDE.md](./CLAUDE.md#required-environment-variables).

**Required**

| Variable | What it is |
|---|---|
| `AUTH_SECRET` | `openssl rand -base64 32` |
| `AUTH_ZITADEL_ID` / `AUTH_ZITADEL_SECRET` / `AUTH_ZITADEL_ISSUER` | OIDC client + issuer URL |
| `NEXTAUTH_URL` / `NEXT_PUBLIC_APP_URL` | App base URL |
| `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` / `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Stripe |
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` | Data layer |
| `UPLOADS_DIR` | Mounted volume for photos + documents (e.g. `/app/uploads`) |

**Optional (each disables silently when unset)**

| Variable | Enables |
|---|---|
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` | All email (receipts, maintenance, announcements). Use the SMTP key, not an HTTP API key. |
| `ZITADEL_SERVICE_TOKEN` / `ZITADEL_ORG_ID` | One-click tenant invites + admin password reset |
| `MATTERMOST_WEBHOOK_URL` | Ops notifications (signup, subscription, rent) |
| `MATTERMOST_URL` / `MATTERMOST_BOT_TOKEN` / `MATTERMOST_MAINTENANCE_CHANNEL_ID` | Maintenance threads + emoji status + photos |
| `MATTERMOST_OUTGOING_TOKEN` | Inbound replies from Mattermost (with the bridge) |

> One persistent volume at `UPLOADS_DIR` covers both maintenance photos and documents. Without it, uploaded files vanish on every redeploy.

---

## Deployment

EZPM runs anywhere that hosts a Next.js app plus a Postgres. The reference setup is Coolify on a single server behind Cloudflare:

1. Point your app domain at the server (Cloudflare tunnel → Traefik works well).
2. Stand up Postgres + PostgREST (a Caddy-shimmed compose stack), or point the `SUPABASE_*` vars at Supabase SaaS.
3. Create the Stripe webhook → `https://<app>/api/webhooks/stripe`, set `STRIPE_WEBHOOK_SECRET`.
4. Set up Zitadel ([runbook](./scripts/zitadel-setup-runbook.md)).
5. Mount a persistent volume at `UPLOADS_DIR`.
6. Deploy; the first person to log in becomes admin.

For the live cutover from an older schema, see [`MIGRATION.md`](./MIGRATION.md).

---

## Database

`supabase/schema.sql` is the single source of truth. Core tables: `users`, `tenants`, `properties`, `payment_methods`, `payments`, `stripe_events`, `system_settings`. Feature tables: `maintenance_requests`, `maintenance_attachments`, `maintenance_comments`, `documents`, `announcements`. Per-tenant email toggles live on `tenants`.

Apply to a fresh database by running the file in your SQL editor. The table-by-table rundown is in [CLAUDE.md](./CLAUDE.md#database-schema-supabaseschemasql).

---

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Local dev server on `http://localhost:3000` |
| `npm run build` | Production build |
| `npm run lint` | ESLint |
| `npm test` | Vitest (file-storage security suite) |
| `npm run reconcile-stripe` | Replay Stripe events since the last sync after downtime (add `-- --dry-run` to preview) |
| `npm run preview-receipt` | Render the receipt email to `email-templates/receipt-preview.html` |

---

## Security highlights

- Sessions are encrypted+signed JWE cookies (Auth.js v5).
- Logout is federated: it kills both the app session and the Zitadel session, so the user isn't silently signed back in.
- Admin is gated to the first authenticated user via an atomic SQL lock; self-registration is off.
- Stripe webhooks verify the signature before doing anything; an idempotency table blocks replays.
- Uploaded files use random UUID names, server-side type/size checks, path-traversal guards, and ownership-checked serving (`lib/storage.test.ts` covers these).
- No raw card or bank numbers ever touch the server; everything is tokenized by Stripe.

---

## Documentation

| Doc | Read it for |
|---|---|
| [CLAUDE.md](./CLAUDE.md) | Architecture, env reference, key flows, security model, schema |
| [MIGRATION.md](./MIGRATION.md) | Live cutover from the old custom-auth + Moov schema |
| [MAINTENANCE-PLAN.md](./MAINTENANCE-PLAN.md) | Design of the maintenance feature |
| [scripts/zitadel-setup-runbook.md](./scripts/zitadel-setup-runbook.md) | One-time Zitadel setup |
| [mattermost-bridge/README.md](./mattermost-bridge/README.md) | Optional two-way Mattermost sync |
| [docs/README.md](./docs/README.md) | Marketing site (GitHub Pages) |

---

## Contributing

Issues and PRs welcome. Keep new third-party integrations behind a config guard that no-ops when unset (see `lib/email.ts`, `lib/mattermost.ts`), and never hardcode instance IDs or credentials.

## License

[AGPLv3](LICENSE). If you run a modified version as a network service, you must offer your users the source.
