# Zitadel one-time setup for ezpm

Performed by the operator (you) before code deploy. ~10 minutes in the browser.

## Prerequisites

- Access to https://auth.getezpm.com/ui/console as an existing Zitadel admin
- Your owner email address handy (the email you want to use as the first / admin user of ezpm)

## Steps

### 1. Create the organization

1. Log into https://auth.getezpm.com/ui/console as the existing Zitadel admin.
2. Top-right org switcher → **Add Organization**.
3. Name: `ezpm` (or `Qureshi Rentals` — your call).
4. Click **Create**. Switch into the new org.

### 2. Disable self-registration (closes outside-voice finding F1)

1. Inside the new org → **Settings** (left sidebar).
2. **Login Behavior and Security** → toggle **Allow Register** to **OFF**.
3. Keep **Allow Username and Password** = ON.
4. Force MFA: leave OFF for now (T15 future task).
5. Save.

### 3. Create the project

1. **Projects** (top nav) → **+ Create New Project**.
2. Name: `ezpm-web`.
3. Click **Create**. Open the project.

### 4. Create the OIDC application

1. Inside the `ezpm-web` project → **Applications** tab → **+ New Application**.
2. Name: `app.getezpm.com`.
3. Type: **Web**.
4. Click **Continue**.
5. Auth method: **CODE** (Authorization Code + PKCE).
6. Click **Continue**.
7. **Redirect URIs** — add BOTH on separate lines:
   ```
   http://localhost:3000/api/auth/callback/zitadel
   https://app.getezpm.com/api/auth/callback/zitadel
   ```
8. **Post Logout Redirect URIs** — add BOTH:
   ```
   http://localhost:3000
   https://app.getezpm.com
   ```
9. Click **Continue** → **Create**.
10. **COPY THE CLIENT SECRET** that appears in the success dialog — Zitadel shows it only once. Save it somewhere safe (you'll paste it to the agent + into Coolify env vars later).
11. Click **Close**.

### 5. Enable dev mode + ID token claims + Default Redirect URI

1. Open the `app.getezpm.com` app you just created.
2. **Redirect Settings** section:
   - Toggle **Development Mode** to **ON** (required because we registered an http://localhost URL per D8).
   - Set **Default Redirect URI** to `https://app.getezpm.com`. **CRITICAL** — this is the URL Zitadel redirects users to after invite completion (when there's no OIDC requestId context). Without it, tenants who finish setting their password get dumped on the Zitadel console instead of bounced back to the EZPM app. The federated logout flow also lands here.
3. **Token Settings** section:
   - **User Roles inside ID Token** = ON
   - **User Info inside ID Token** = ON
4. Save.

### 6. Copy your credentials

From the app detail page:

- **Client ID** (looks like `123456789012345678@ezpm-web`): copy it.
- **Client Secret**: you copied this in step 4.10 — if you lost it, click **Regenerate Secret** and copy the new one.
- **Issuer URL**: this is always `https://auth.getezpm.com` (already known).

### 7. Invite yourself as the first member

1. Top nav → switch back to `ezpm` org (top-right org switcher).
2. **Users** (left sidebar) → **+ New** → fill in your owner email + first/last name.
3. Set a temporary password OR pick "Send password setup email" — your call.
4. Click **Create**.
5. (Optional) **Authorizations** tab on the user → add any project roles you want. For now, ezpm's "first user = admin" bootstrap will mark you admin on first login regardless of Zitadel roles.

### 8. Verify the OIDC endpoint is healthy

In a terminal:

```bash
curl -s https://auth.getezpm.com/.well-known/openid-configuration | jq '.issuer, .authorization_endpoint, .token_endpoint'
```

Expected output:

```json
"https://auth.getezpm.com"
"https://auth.getezpm.com/oauth/v2/authorize"
"https://auth.getezpm.com/oauth/v2/token"
```

If those URLs come back as expected, Zitadel is ready.

## What to give the agent (or paste into Coolify)

```
AUTH_ZITADEL_ID=<client_id from step 6>
AUTH_ZITADEL_SECRET=<client_secret from step 4.10 or 6>
AUTH_SECRET=<run: openssl rand -base64 32>
```

(The `AUTH_ZITADEL_ISSUER` is always `https://auth.getezpm.com` so I'll hardcode it in the example .env.)

---

## Service User for ezpm admin integration (D15)

Optional but strongly recommended: this enables the admin panel to auto-invite tenants in one click instead of bouncing between ezpm and Zitadel admin UIs. ~5 minutes in the Zitadel UI.

### 1. Create a machine user

1. In Zitadel admin → switch to the `ezpm` org.
2. **Users** → **+ New** → choose **Machine User** (not Human).
3. Username: `ezpm-svc`
4. Name: `EZPM Server Integration`
5. **Access Token Type**: `Bearer` (default)
6. Click **Create**.

### 2. Grant the machine user the right role

The cleanest path is via **org Members** (not the user's Authorizations tab):

1. Top nav → switch to the `ezpm` org (you should already be there).
2. Open the org settings page: `https://auth.getezpm.com/ui/console/org` (uses the currently-selected org).
3. **Members** → **+ New Member**.
4. Pick the `ezpm-svc` user.
5. Role: **`ORG_OWNER`** (recommended — gives access to user lookups too, which `lib/zitadel.ts` `findUserByEmail` needs for the idempotent re-invite path). `ORG_USER_MANAGER` works for create/invite but blocks some user-search calls.
6. Save.

**Verify it landed** — from your EZPM container:

```bash
docker exec $(docker ps --format '{{.Names}}' | grep -E '^vckkco' | head -1) sh -c \
  'curl -s -H "Authorization: Bearer $ZITADEL_SERVICE_TOKEN" \
   https://auth.getezpm.com/v2/users/human \
   -X POST -H "Content-Type: application/json" \
   -d "{\"organization\":{\"orgId\":\"$ZITADEL_ORG_ID\"},
        \"username\":\"perm-test@example.invalid\",
        \"profile\":{\"givenName\":\"T\",\"familyName\":\"T\"},
        \"email\":{\"email\":\"perm-test@example.invalid\"}}"'
```

HTTP 200 with a `userId` in the response = permissions granted correctly. Clean up with a DELETE on that userId.

### 3. Generate the Personal Access Token

1. Back on the `ezpm-svc` user's detail page → **Personal Access Tokens** tab → **+ New**.
2. Expiration: pick something far out (e.g. 2099-01-01) or leave default for 1y.
3. Click **Create**.
4. **Copy the token immediately** — Zitadel shows it ONCE (format: `pat_...`).

### 4. Find the ezpm org ID

In the Zitadel admin URL when you're viewing the ezpm org's settings, the URL looks like:

```
https://auth.getezpm.com/ui/console/orgs/375198905173803523
```

The number at the end is your `ZITADEL_ORG_ID`.

### 4b. Configure SMTP (so invite emails actually send)

**Critical — without SMTP, invite_code calls return HTTP 200 but no email goes out.** Zitadel queues the email and silently drops it if there's no active SMTP transport.

SMTP is an **instance-level** setting in Zitadel V4 (not org-level). You need to be logged in as the **instance admin** (the bootstrap user from initial Zitadel setup — typically `zitadel-admin@zitadel.auth.getezpm.com` or similar). The `Admin@getezpm.com` org owner can't access instance settings.

1. Open `https://auth.getezpm.com/ui/console/instance?id=smtpprovider`
2. Click **Add SMTP Provider** → pick **Brevo** (or whichever provider you use)
3. Fill in:
   - **Description**: `brevo`
   - **Sender Address**: `admin@getezpm.com` (or whatever verified sender you have)
   - **Sender Name**: `EZPM`
   - **TLS**: ON
   - **Host**: `smtp-relay.brevo.com:587`
   - **User**: your Brevo SMTP login (Brevo dashboard → SMTP & API → SMTP keys)
   - **Password**: your Brevo SMTP key
4. **Save** AND click the activate toggle (Zitadel keeps the config inactive until you explicitly activate it — a common gotcha).
5. Test: same page → **Test SMTP settings** → enter your own email → click Test. If you receive the test email, you're done.

#### Deliverability (avoiding the spam folder)

Without domain auth, every recipient (especially Gmail, Workspace) flags emails from `*@getezpm.com` as suspicious and either drops them or sends to spam. Brevo dashboard → **Senders & IP → Domains** → **+ Add a domain** → `getezpm.com`. Brevo gives you 3-4 DNS records to add in Cloudflare DNS (TXT/CNAME, gray cloud / DNS only):

- SPF: `getezpm.com` TXT `v=spf1 include:spf.brevo.com ?all`
- DKIM: `brevo._domainkey.getezpm.com` (Brevo provides exact value)
- Ownership: a unique TXT Brevo gives you
- Optional DMARC: `_dmarc.getezpm.com`

Once added, click **Verify** in Brevo. After verification, deliveries no longer get greylisted/spammed.

#### What to do if invites don't arrive

1. Check Brevo dashboard → **Statistics → Email statistics** → filter recent. Status meanings: `Sent` (handed off), `Delivered` (recipient accepted), `Deferred` (temp reject, retry pending — usually greylisting), `Soft/Hard bounce` (delivery failed), `Blocked` (Brevo refused).
2. `Deferred` is normal for new sender domains hitting Workspace inboxes — Brevo retries every 5-15 min, usually delivers within 30 min.
3. If `Sent` → `Delivered` but no email in inbox: check spam folder.
4. Persistent failures → set up domain authentication above.

### 5. Set the env vars in Coolify

In the Coolify env config for the ezpm app, add:

```
ZITADEL_SERVICE_TOKEN=<the pat_... token from step 3>
ZITADEL_ORG_ID=<the numeric org id from step 4>
```

Restart the container. From the next "Create Tenant" submit, ezpm will:

- Create the user in Zitadel (via `lib/zitadel.ts` `createHumanUser`)
- Generate an invitation code (`sendInvitation`)
- Hand the rendered email to your configured SMTP relay (Brevo) for delivery
- Email contains a link to Zitadel's hosted login UI (`https://auth.getezpm.com/ui/v2/login/verify?code=...&userId=...&invite=true`) with the 6-char code pre-filled in the URL

The tenant clicks → form auto-fills the code → click Continue → sets password in Zitadel's hosted UI (gets your org's password policy + optional MFA enrollment for free) → Zitadel uses the OIDC app's **Default Redirect URI** to bounce them to `https://app.getezpm.com` → home → `/auth/start` → OIDC silent SSO via the just-created Zitadel session → callback → first sign-in provisions the user → `/tenant`.

If `ZITADEL_SERVICE_TOKEN` is missing, tenant creation still works — it falls back to a "Invite this email manually in Zitadel admin" message in the response. If SMTP isn't configured, the API call returns 200 but no email goes out (silent failure — check Zitadel logs).

---

## Federated logout pre-requisite

`/auth/signout` in EZPM does federated logout by calling Zitadel's `end_session_endpoint` with `id_token_hint` + `post_logout_redirect_uri=https://app.getezpm.com`. For that redirect to land back on the EZPM app (instead of a Zitadel "logged out" page), the OIDC app must have `https://app.getezpm.com` in its **Post Logout Redirect URIs** list (step 4 of the OIDC app setup above). Already done if you followed step 4 verbatim — just noting why it matters.
