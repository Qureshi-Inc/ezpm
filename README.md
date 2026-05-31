# EZPM — EZ Property Manager

Rent-collection platform for a small portfolio of properties. Tenants log in via Zitadel OIDC, save a card or bank account, and Stripe Subscriptions auto-charges them on their monthly due date.

Production: https://app.getezpm.com

## Features

- **Auto-pay rent** — tenants save a card or US bank account (ACH); Stripe Subscriptions charges them on their monthly due date. Branded email receipts on every payment.
- **Maintenance requests** — tenants report issues with photos; admin tracks status (`open → in_progress → resolved`); a two-way comment thread on each request. Status/reply emails to the tenant.
- **Documents** — a per-tenant folder both the tenant and admin can upload to (lease, insurance, proof of income, notices) with ownership-checked file serving.
- **Announcements** — admin posts notices that appear on every tenant's dashboard, optionally emailed.
- **Notification preferences** — tenants opt out of specific emails in `/tenant/settings`.
- **Invite-only auth** — Zitadel OIDC; first user becomes admin; one-click tenant invites; admin-triggered password resets.
- **Optional Mattermost ops integration** — request/payment notifications, one thread per maintenance request with emoji status, and an optional bridge that mirrors Mattermost thread replies back into the app (see [`mattermost-bridge/`](./mattermost-bridge/)).

All integrations are env-gated: leave the keys unset and that feature silently disables.

## Stack

- **Next.js 15** (App Router, React 19, TypeScript, Tailwind, shadcn/ui)
- **Auth.js v5** with Zitadel OIDC provider (`auth.getezpm.com`)
- **Stripe** — cards + `us_bank_account` (ACH via Financial Connections), Subscriptions for monthly auto-pay
- **Supabase Postgres** for data (self-hosted Postgres + PostgREST works too)
- **Email** — any SMTP relay via `SMTP_*` env (we use Brevo)
- **Coolify** for self-hosted deploy (auto-deploy on push to main)
- **Optional:** Mattermost ops notifications + two-way maintenance bridge

See [CLAUDE.md](./CLAUDE.md) for full architecture, env vars, key flows, and security model.

## Local development

```bash
git clone git@github.com:Qureshi-Inc/ezpm.git
cd ezpm
npm install
cp .env.example .env.local
# Fill in .env.local — see CLAUDE.md for what each var means
npm run dev
```

To run the app locally against the same Zitadel + Stripe accounts as prod:
- Make sure your Zitadel OIDC app has `http://localhost:3000/api/auth/callback/zitadel` registered as a redirect URI AND dev mode is enabled (see `scripts/zitadel-setup-runbook.md`).
- Use Stripe test keys (`sk_test_...`, `pk_test_...`) in `.env.local`.

## Operational scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Local dev server on `http://localhost:3000` |
| `npm run build` | Production build |
| `npm run lint` | ESLint |
| `npm run reconcile-stripe` | Replay Stripe events since the last successful sync. Use after server downtime to catch missed webhooks. Add `-- --dry-run` to preview. |

## Database schema

`supabase/schema.sql` is the single source of truth. To apply to a fresh database:
1. Drop everything: `DROP TABLE IF EXISTS auto_payments, payments, payment_methods, tenants, properties, users CASCADE;`
2. Run the schema file in the Supabase SQL Editor.

For the LIVE database cutover from the old (custom-auth + Moov) schema, see [`MIGRATION.md`](./MIGRATION.md).

## Zitadel setup

One-time setup is in [`scripts/zitadel-setup-runbook.md`](./scripts/zitadel-setup-runbook.md). Run that first; come back here for the rest.

## License

[AGPLv3](LICENSE).
