# Zitadel one-time setup for ezpm

Performed by the operator (you) before code deploy. ~10 minutes in the browser.

## Prerequisites

- Access to https://auth.kainban.com/ui/console as an existing Zitadel admin
- Your owner email address handy (the email you want to use as the first / admin user of ezpm)

## Steps

### 1. Create the organization

1. Log into https://auth.kainban.com/ui/console as the existing Zitadel admin.
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
2. Name: `rent.qureshi.io`.
3. Type: **Web**.
4. Click **Continue**.
5. Auth method: **CODE** (Authorization Code + PKCE).
6. Click **Continue**.
7. **Redirect URIs** — add BOTH on separate lines:
   ```
   http://localhost:3000/api/auth/callback/zitadel
   https://rent.qureshi.io/api/auth/callback/zitadel
   ```
8. **Post Logout Redirect URIs** — add BOTH:
   ```
   http://localhost:3000
   https://rent.qureshi.io
   ```
9. Click **Continue** → **Create**.
10. **COPY THE CLIENT SECRET** that appears in the success dialog — Zitadel shows it only once. Save it somewhere safe (you'll paste it to the agent + into Coolify env vars later).
11. Click **Close**.

### 5. Enable dev mode + ID token claims

1. Open the `rent.qureshi.io` app you just created.
2. **Redirect Settings** section → toggle **Development Mode** to **ON** (required because we registered an http://localhost URL per D8).
3. **Token Settings** section:
   - **User Roles inside ID Token** = ON
   - **User Info inside ID Token** = ON
4. Save.

### 6. Copy your credentials

From the app detail page:

- **Client ID** (looks like `123456789012345678@ezpm-web`): copy it.
- **Client Secret**: you copied this in step 4.10 — if you lost it, click **Regenerate Secret** and copy the new one.
- **Issuer URL**: this is always `https://auth.kainban.com` (already known).

### 7. Invite yourself as the first member

1. Top nav → switch back to `ezpm` org (top-right org switcher).
2. **Users** (left sidebar) → **+ New** → fill in your owner email + first/last name.
3. Set a temporary password OR pick "Send password setup email" — your call.
4. Click **Create**.
5. (Optional) **Authorizations** tab on the user → add any project roles you want. For now, ezpm's "first user = admin" bootstrap will mark you admin on first login regardless of Zitadel roles.

### 8. Verify the OIDC endpoint is healthy

In a terminal:

```bash
curl -s https://auth.kainban.com/.well-known/openid-configuration | jq '.issuer, .authorization_endpoint, .token_endpoint'
```

Expected output:

```json
"https://auth.kainban.com"
"https://auth.kainban.com/oauth/v2/authorize"
"https://auth.kainban.com/oauth/v2/token"
```

If those URLs come back as expected, Zitadel is ready.

## What to give the agent (or paste into Coolify)

```
AUTH_ZITADEL_ID=<client_id from step 6>
AUTH_ZITADEL_SECRET=<client_secret from step 4.10 or 6>
AUTH_SECRET=<run: openssl rand -base64 32>
```

(The `AUTH_ZITADEL_ISSUER` is always `https://auth.kainban.com` so I'll hardcode it in the example .env.)

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

1. On the new `ezpm-svc` user's detail page → **Authorizations** tab → **+ New**.
2. Project: pick `ezpm-web`.
3. Roles: select `ORG_USER_MANAGER` (or `IAM_USER_MANAGER` if you don't see that one).
4. Save.

Actually — for org-scoped user management, the cleaner path is:

1. Top nav → switch to the `ezpm` org (you should already be there).
2. **Settings** → **Members** → **+ New Member**.
3. Pick the `ezpm-svc` user.
4. Role: `ORG_USER_MANAGER` (lets the service user create/update users in this org).
5. Save.

### 3. Generate the Personal Access Token

1. Back on the `ezpm-svc` user's detail page → **Personal Access Tokens** tab → **+ New**.
2. Expiration: pick something far out (e.g. 2099-01-01) or leave default for 1y.
3. Click **Create**.
4. **Copy the token immediately** — Zitadel shows it ONCE (format: `pat_...`).

### 4. Find the ezpm org ID

In the Zitadel admin URL when you're viewing the ezpm org's settings, the URL looks like:

```
https://auth.kainban.com/ui/console/orgs/375198905173803523
```

The number at the end is your `ZITADEL_ORG_ID`.

### 5. Set the env vars in Coolify

In the Coolify env config for the ezpm app, add:

```
ZITADEL_SERVICE_TOKEN=<the pat_... token from step 3>
ZITADEL_ORG_ID=<the numeric org id from step 4>
```

Restart the container. From the next "Create Tenant" submit, ezpm will:

- Create the user in Zitadel
- Generate an invitation code
- Have Zitadel email the tenant a link to Zitadel's hosted login UI (`https://auth.kainban.com/ui/v2/login/verify?...`)

The tenant clicks → enters the 6-char code from the email → sets password in Zitadel's hosted UI (gets your org's password policy + optional MFA enrollment for free) → Zitadel finishes the OIDC flow and lands them on `/tenant`.

If the env vars are missing, tenant creation still works — it just falls back to a "Invite this email manually in Zitadel admin" message in the response.
