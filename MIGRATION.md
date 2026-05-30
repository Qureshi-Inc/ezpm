# EZPM cutover runbook (Zitadel + Stripe Subscriptions + self-hosted DB)

This runbook walks through the live cutover for the `migrate-zitadel-stripe-subs` PR. Read it end-to-end before starting.

## What this cutover does

1. Replaces the Supabase SaaS database with self-hosted **postgres + PostgREST + Caddy** running locally as `ezpm-db` (see `/home/opti3/services/ezpm-db/`). The ezpm app keeps using `@supabase/supabase-js` — it talks to PostgREST through Caddy's URL shim. Zero app code changes.
2. Replaces the custom bcrypt + base64-JSON cookie auth with Zitadel OIDC via Auth.js v5.
3. Drops Moov entirely; consolidates to Stripe (card + `us_bank_account` ACH).
4. Introduces Stripe Subscriptions for monthly auto-charge so home-server downtime no longer causes missed rent.

## Prerequisites

- [ ] Zitadel org + OIDC app set up per `scripts/zitadel-setup-runbook.md`. Have these three values ready:
  - `AUTH_ZITADEL_ID`
  - `AUTH_ZITADEL_SECRET`
  - `AUTH_SECRET` (from `openssl rand -base64 32`)
- [ ] Your owner email already invited as a Zitadel user, password set.
- [ ] `ezpm-db` stack running (`docker compose ps` in `/home/opti3/services/ezpm-db/` shows all 3 containers healthy).
- [ ] Stripe webhook endpoint ready (we'll update it in step 3).

## Cutover (estimated 20 minutes if nothing breaks)

### 1. Update Coolify env vars

In the Coolify UI for the ezpm app → Environment Variables.

**Remove (no longer needed):**

```
MOOV_ACCOUNT_ID
MOOV_DOMAIN
MOOV_PUBLIC_KEY
MOOV_SECRET_KEY
NEXT_PUBLIC_MOOV_FACILITATOR_ACCOUNT_ID
```

**Replace (Supabase SaaS → self-hosted DB):**

Old (delete):
```
NEXT_PUBLIC_SUPABASE_URL=https://isygihdulvjbmybcjgji.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<old jwt>
SUPABASE_SERVICE_ROLE_KEY=<old jwt>
```

New (paste from `/home/opti3/services/ezpm-db/coolify-env-snippet.txt`):
```
NEXT_PUBLIC_SUPABASE_URL=http://ezpm-db-caddy
NEXT_PUBLIC_SUPABASE_ANON_KEY=<new JWT signed with our JWT_SECRET>
SUPABASE_SERVICE_ROLE_KEY=<new service_role JWT>
```

The hostname `ezpm-db-caddy` resolves over the `coolify` Docker network. The new JWTs are signed with the secret in `/home/opti3/services/ezpm-db/.env`.

**Add (Auth.js v5 + Zitadel):**

```
AUTH_SECRET=<openssl rand -base64 32 output>
AUTH_ZITADEL_ID=<client id from Zitadel app, e.g. 375204933076517379>
AUTH_ZITADEL_SECRET=<client secret from Zitadel app>
AUTH_ZITADEL_ISSUER=https://auth.kainban.com
NEXTAUTH_URL=https://rent.qureshi.io
```

**Keep (no change):**

```
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
NEXT_PUBLIC_APP_URL
```

Save the env changes in Coolify. **Do NOT redeploy yet.**

### 2. (Optional) Take a final Supabase backup

If you ever want to consult the old data again, take an on-demand backup in Supabase dashboard → Database → Backups. You can cancel the Supabase project entirely after the cutover is verified.

### 3. Confirm Stripe webhook endpoint

In the Stripe Dashboard → Developers → Webhooks:

- Endpoint URL: `https://rent.qureshi.io/api/webhooks/stripe`
- Events to send:
  - `invoice.created`
  - `invoice.finalized`
  - `invoice.payment_succeeded`
  - `invoice.payment_failed`
  - `invoice.marked_uncollectible`
  - `invoice.voided`
  - `customer.subscription.created`
  - `customer.subscription.updated`
  - `customer.subscription.deleted`
- Signing secret (`whsec_...`): make sure it matches `STRIPE_WEBHOOK_SECRET` in Coolify. If you rotated it, paste the new value into Coolify now.

### 4. Merge the PR → Coolify auto-deploys

```bash
gh pr merge migrate-zitadel-stripe-subs --squash
# or merge in the GitHub UI
```

Coolify watches `main` and auto-deploys on push. Watch the build logs in Coolify UI. Should take 3-5 minutes.

If the build fails on `npm run build`, the deploy stops and the old container keeps serving. Fix forward.

### 5. Self-bootstrap as admin

- Open `https://rent.qureshi.io/admin` in a fresh incognito window.
- Should redirect to `auth.kainban.com` (Zitadel ezpm org login UI).
- Log in with the Zitadel account you invited yourself to in the runbook.
- After the OIDC callback you should land on `/admin` as the ezpm admin (first-user-wins bootstrap).

If you land on `/tenant` instead, you weren't the first user. Check the ezpm-db users table:

```bash
docker exec ezpm-postgres psql -U postgres -d ezpm -c \
  "SELECT email, role FROM users ORDER BY created_at;"
```

If someone else got admin, flip your role:

```bash
docker exec ezpm-postgres psql -U postgres -d ezpm -c \
  "UPDATE users SET role = 'admin' WHERE email = '<your-email>';"
```

### 6. Re-onboard the 3 properties' tenants

For each tenant:

1. **In ezpm admin** → Properties → Create (if you haven't already since the schema is fresh).
2. **In ezpm admin** → Tenants → Add New Tenant. Fill in their email + property + due day. Submit.
3. **In Zitadel admin UI** (`auth.kainban.com/ui/console` → ezpm org → Users → New), invite the same email. Zitadel sends them the invite link.
4. **Tenant** accepts the invite, sets a Zitadel password, logs into `rent.qureshi.io`. Provisioning route auto-links them to the tenants row by email.
5. **Tenant** adds a payment method (card or bank) at `/tenant/payment-methods/add`. On successful add, the Stripe Customer + Subscription are auto-created. The first invoice will land on the next payment_due_day.

### 7. Sanity check

- **Stripe Dashboard → Customers**: one Customer per tenant who's added a payment method.
- **Stripe Dashboard → Subscriptions**: one Subscription per onboarded tenant.
- **ezpm admin → Payments page** → click **Debug tenants** → every tenant shows `Zitadel user`, `Stripe customer`, `Stripe subscription` all populated.
- Click **Run Stripe reconcile** → should report `processed=0` if everything is already mirrored.

## Rollback

If anything is wrong AFTER step 4:

1. **Roll back Coolify deploy:** Coolify UI → Deployments → click the prior deploy → Redeploy.
2. **Restore the old env vars:** put back the old `NEXT_PUBLIC_SUPABASE_*` values and remove the `AUTH_*` ones. The old ezpm code will run against the Supabase SaaS DB again.
3. **The ezpm-db stack** can stay running (it's harmless when nothing is pointing at it). Or `docker compose down -v` in `/home/opti3/services/ezpm-db/` to wipe it.

## Backup strategy for self-hosted DB

The `ezpm-pgdata` volume lives under `/var/lib/docker/volumes/ezpm-db_ezpm-pgdata/_data`. Wire it into your existing backup-status / restic / cron pipeline. A one-off pg_dump:

```bash
docker exec ezpm-postgres pg_dump -U postgres ezpm -Fc \
  > ~/ezpm-backups/$(date -u +%Y-%m-%dT%H-%M-%SZ).dump
```

To restore:

```bash
# Stop the ezpm app first so it doesn't write during restore.
docker exec -i ezpm-postgres pg_restore -U postgres -d ezpm --clean --if-exists \
  < ~/ezpm-backups/<your-backup>.dump
```

## Post-cutover follow-ups

See `CLAUDE.md` → Deferred section. Highest priority is T12 (ACH return webhooks — bounced ACH currently shows as paid until manually reconciled).
