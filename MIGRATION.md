# EZPM cutover runbook (Zitadel + Stripe Subscriptions migration)

This runbook walks through the live cutover for the `migrate-zitadel-stripe-subs` PR. Read it end-to-end before starting. The schema replacement is destructive; rollback requires a pg_dump taken BEFORE you start (see step 1).

## Prerequisites

- [ ] You've completed `scripts/zitadel-setup-runbook.md` and have:
  - `AUTH_ZITADEL_ID`
  - `AUTH_ZITADEL_SECRET`
  - Your owner email invited in Zitadel and the password set
- [ ] You have the new env vars ready to paste into Coolify (see CLAUDE.md → Required Environment Variables)
- [ ] You have your Stripe webhook secret rotated and ready (or you'll re-create the webhook in step 4)
- [ ] You have postgres access to the Supabase project (connection string from Supabase dashboard → Settings → Database)

## Cutover (estimated 30 minutes if nothing goes wrong)

### 1. Back up the live database (T13 deferred — do this manually here)

From the Supabase dashboard:
- Settings → Database → Connection string → URI (copy the postgres URI)
- OR: Settings → Database → Backups → On-demand backup (if your tier supports it)

If using the postgres URI, on any machine with `pg_dump` installed:

```bash
pg_dump -Fc "postgresql://postgres:<password>@db.<project>.supabase.co:5432/postgres" \
  > ezpm-pre-zitadel-$(date -u +%Y-%m-%dT%H-%M-%SZ).dump
```

Stash this file somewhere durable (S3, Drive, your home machine — not just `/tmp`). It is your ONLY recovery path if the new schema has a bug.

To restore later (rollback):

```bash
pg_restore -d "postgresql://..." --clean --if-exists ezpm-pre-zitadel-<timestamp>.dump
```

### 2. Apply the new schema to the live database

In the Supabase SQL editor (Settings → SQL Editor → New query):

1. Run `DROP TABLE IF EXISTS auto_payments, payments, payment_methods, tenants, properties, users CASCADE;` (drops in dependency order)
2. Paste the contents of `supabase/schema.sql` and execute.
3. Verify the new tables exist: `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public';` — should show `users`, `tenants`, `properties`, `payment_methods`, `payments`, `stripe_events`, `system_settings`.
4. Verify the RPC: `\df provision_user_from_zitadel` (or `SELECT proname FROM pg_proc WHERE proname = 'provision_user_from_zitadel';`).

If anything failed, restore from the dump (step 1) before continuing.

### 3. Push the env vars to Coolify

In the Coolify UI for the ezpm app:

- **Remove:** `MOOV_ACCOUNT_ID`, `MOOV_DOMAIN`, `MOOV_PUBLIC_KEY`, `MOOV_SECRET_KEY`, `NEXT_PUBLIC_MOOV_FACILITATOR_ACCOUNT_ID`
- **Add:** `AUTH_SECRET`, `AUTH_ZITADEL_ID`, `AUTH_ZITADEL_SECRET`, `AUTH_ZITADEL_ISSUER` (= `https://auth.kainban.com`), `NEXTAUTH_URL` (= `https://rent.qureshi.io`)
- **Keep:** all `STRIPE_*` and `SUPABASE_*` vars unchanged

Save. Don't redeploy yet.

### 4. Confirm the Stripe webhook endpoint

In the Stripe Dashboard:
- Developers → Webhooks
- Endpoint URL: `https://rent.qureshi.io/api/webhooks/stripe`
- Events to send (at minimum):
  - `invoice.created`
  - `invoice.finalized`
  - `invoice.payment_succeeded`
  - `invoice.payment_failed`
  - `invoice.marked_uncollectible`
  - `invoice.voided`
  - `customer.subscription.created`
  - `customer.subscription.updated`
  - `customer.subscription.deleted`
- Copy the signing secret (`whsec_...`) into the Coolify env var `STRIPE_WEBHOOK_SECRET`.

### 5. Merge & deploy

- Merge the PR (`/ship` handles this if you've configured it; otherwise `gh pr merge --squash`).
- Coolify auto-deploys on push to main. Watch the build logs.
- Wait for the build to finish.

### 6. Self-bootstrap as admin

- Open `https://rent.qureshi.io/admin` in a fresh browser window (or incognito).
- Should redirect to `auth.kainban.com` → log in with the Zitadel account you invited yourself to in step 7 of the Zitadel runbook.
- After the OIDC callback, you should land on `/admin` as the ezpm admin (first-user-wins bootstrap).
- If you land on `/tenant` instead, you're NOT the first user. Check the `users` table: `SELECT * FROM users;` — if there's already an admin, the bootstrap ran for someone else and you'll need to manually flip your role: `UPDATE users SET role = 'admin' WHERE email = '<your-email>';`

### 7. Re-onboard the 3 live properties' tenants

For each tenant:

1. In ezpm admin → Properties → Create (if you haven't already, since the wipe).
2. Admin → Tenants → Add New Tenant. Fill in their email + property + due day. Submit.
3. In Zitadel admin UI (auth.kainban.com/ui/console → ezpm org → Users → New), invite the same email. Zitadel sends them the invite link.
4. Tenant accepts, sets password, logs into `rent.qureshi.io`. Provisioning route auto-links them to the tenants row by email.
5. Tenant adds a payment method (card or bank). On successful add, the Stripe Customer + Subscription are auto-created. Their first invoice will land on the next payment_due_day.

### 8. Sanity check

- In Stripe Dashboard → Customers, you should see one Customer per tenant who's added a payment method.
- In Stripe Dashboard → Subscriptions, one Subscription per onboarded tenant.
- In the ezpm admin payments page, click "Debug tenants" — every tenant should show `Zitadel user`, `Stripe customer`, `Stripe subscription` all populated.
- Click "Run Stripe reconcile" — should report `processed=0` if everything is already mirrored, `skipped=N` for already-seen events.

## Rollback

If anything is wrong AFTER step 5 and you can't fix forward:

1. Roll back Coolify to the previous deploy (Coolify UI → Deployments → click the prior one → Redeploy).
2. Restore the pg_dump from step 1:
   ```bash
   pg_restore -d "postgresql://..." --clean --if-exists <your-dump-file>
   ```
3. Remove the new env vars and restore the Moov env vars in Coolify if needed.
4. The Stripe Customers/Subscriptions you created in step 7 will remain in Stripe. They're harmless until/unless you re-cutover. Cancel any test subscriptions you don't want.

## Post-cutover follow-ups

See `CLAUDE.md` → Deferred section. The high-priority follow-up is T12 (ACH return webhooks).
