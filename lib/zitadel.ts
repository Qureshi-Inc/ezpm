/**
 * Zitadel Management API client (server-side).
 *
 * Uses the v2 REST API with a Personal Access Token (PAT) from a Zitadel
 * Service User. The Service User must have either ORG_USER_MANAGER on the
 * ezpm org OR IAM_USER_MANAGER at the instance level. See
 * scripts/zitadel-setup-runbook.md → "Service User for ezpm integration"
 * for the one-time setup.
 *
 * Env vars (all required for invite-flow integration):
 *   AUTH_ZITADEL_ISSUER  - already set (https://auth.getezpm.com)
 *   ZITADEL_SERVICE_TOKEN - the PAT from the ezpm-svc machine user
 *   ZITADEL_ORG_ID       - the ezpm org ID (numeric, find in admin UI URL
 *                          when on the org settings page)
 *
 * If ZITADEL_SERVICE_TOKEN is missing, the helpers throw a clear error so
 * the admin tenant-create flow can fall back to manual invite gracefully.
 */

const BASE_URL = (process.env.AUTH_ZITADEL_ISSUER || 'https://auth.getezpm.com').replace(/\/$/, '')
const TOKEN = process.env.ZITADEL_SERVICE_TOKEN
const ORG_ID = process.env.ZITADEL_ORG_ID

function assertConfigured() {
  if (!TOKEN) {
    throw new Error('ZITADEL_SERVICE_TOKEN env var not set — Zitadel admin integration is disabled')
  }
  if (!ORG_ID) {
    throw new Error('ZITADEL_ORG_ID env var not set — Zitadel admin integration is disabled')
  }
}

interface ZitadelError extends Error {
  status?: number
  zitadelCode?: string
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  assertConfigured()
  const url = `${BASE_URL}${path}`
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  })
  const text = await res.text()
  let body: unknown = null
  try {
    body = text ? JSON.parse(text) : null
  } catch {
    body = text
  }
  if (!res.ok) {
    const err = new Error(
      `Zitadel ${init.method || 'GET'} ${path} failed: ${res.status} ${typeof body === 'object' && body && 'message' in body ? (body as { message: string }).message : text}`,
    ) as ZitadelError
    err.status = res.status
    if (typeof body === 'object' && body && 'code' in body) {
      err.zitadelCode = String((body as { code: unknown }).code)
    }
    throw err
  }
  return body as T
}

// ──────────────────────────────────────────────────────────────
// 1. Create human user
// ──────────────────────────────────────────────────────────────

export interface CreateHumanUserInput {
  email: string
  firstName: string
  lastName: string
  // Optional: pre-mark email verified. Default false (verification happens
  // when the tenant clicks the invite link).
  emailVerified?: boolean
}

export interface CreateHumanUserResult {
  userId: string
  alreadyExisted: boolean
}

/**
 * Idempotent: if a user with this email already exists in the org, returns
 * their existing userId instead of creating a duplicate. This makes the
 * admin tenant-create form safe to re-submit if the first attempt failed
 * partway through.
 */
export async function createHumanUser(input: CreateHumanUserInput): Promise<CreateHumanUserResult> {
  try {
    const res = await call<{ userId: string }>('/v2/users/human', {
      method: 'POST',
      body: JSON.stringify({
        organization: { orgId: ORG_ID },
        username: input.email,
        profile: {
          givenName: input.firstName,
          familyName: input.lastName,
        },
        email: {
          email: input.email,
          isVerified: !!input.emailVerified,
        },
      }),
    })
    return { userId: res.userId, alreadyExisted: false }
  } catch (err) {
    const zErr = err as ZitadelError
    // Zitadel returns ALREADY_EXISTS (code 6) when the username/email collides.
    // Look it up by email and return that userId.
    if (zErr.status === 409 || zErr.zitadelCode === '6' || /already exists/i.test(zErr.message)) {
      const existing = await findUserByEmail(input.email)
      if (existing) {
        return { userId: existing.userId, alreadyExisted: true }
      }
    }
    throw err
  }
}

/**
 * Look up a user by email within the configured org. Returns null if not found.
 * Used by createHumanUser to recover from ALREADY_EXISTS conflicts.
 */
export async function findUserByEmail(email: string): Promise<{ userId: string } | null> {
  const res = await call<{ result?: Array<{ userId: string }> }>('/v2/users', {
    method: 'POST',
    body: JSON.stringify({
      queries: [
        { emailQuery: { emailAddress: email, method: 'TEXT_QUERY_METHOD_EQUALS' } },
        { organizationIdQuery: { organizationId: ORG_ID } },
      ],
    }),
  })
  return res.result?.[0] ?? null
}

// ──────────────────────────────────────────────────────────────
// 2. Send invitation
// ──────────────────────────────────────────────────────────────

export interface SendInvitationInput {
  userId: string
  applicationName?: string  // shown in the email body, e.g. "EZPM Rent Portal"
  // The tenant's login (email). Baked into the email-link URL as
  // ?login_hint=... so the OIDC flow on /auth/start can pass it through
  // to Zitadel's authorize endpoint, letting Zitadel skip the loginname
  // page and route the user straight to the invite verify page.
  //
  // Can't use Zitadel's {{.LoginName}} URL placeholder here — that's only
  // valid in EMAIL body templates, not URL templates. URL templates only
  // accept {{.UserID}}, {{.Code}}, {{.OrgID}} (Zitadel returns
  // "url template is invalid" otherwise).
  loginHint?: string
}

export interface SendInvitationResult {
  // Zitadel returns the verification code in the response only when sendCode
  // is NOT requested. With sendCode, Zitadel sends the email and the code is
  // not surfaced to us. We treat the absence of a thrown error as success.
  sent: true
}

/**
 * Triggers Zitadel to email the user an invitation with a verification code.
 *
 * We deliberately do NOT pass a urlTemplate. With no template, Zitadel's
 * email contains a direct link to its hosted verify page:
 *
 *   https://auth.getezpm.com/ui/v2/login/verify?code=ABCDEF&userId=...&invite=true
 *
 * Two key wins from the default:
 *   1. {code} is in the URL -> Zitadel's verify form auto-fills it, so the
 *      tenant just clicks "Continue" instead of typing the 6-char code.
 *   2. The email is the standard Zitadel template (shows code as text and
 *      as a button) — no missing-code complaints.
 *
 * Post-invite redirect to /tenant is handled by the OIDC app's
 * "Default Redirect URI" setting on the Zitadel admin side (currently
 * https://app.getezpm.com). After Zitadel finishes invite + password
 * setup, it redirects there, our home page bounces to /auth/start, and
 * /auth/start silent-SSO's via the just-established Zitadel session.
 *
 * `loginHint` is accepted (and forwarded into /auth/start via the
 * authorizationParams of the OIDC flow) for compatibility, but is NOT
 * embedded in the urlTemplate since we're not using one.
 *
 * URL template constraints if you ever re-enable a custom one:
 *   - Only {{.UserID}}, {{.Code}}, {{.OrgID}} placeholders are valid.
 *   - {{.LoginName}} is valid in email body templates but NOT URL
 *     templates — Zitadel returns 400 "url template is invalid".
 */
export async function sendInvitation(input: SendInvitationInput): Promise<SendInvitationResult> {
  // Accept input.loginHint to preserve the call-site interface, but it isn't
  // used in the urlTemplate-less default flow. Suppress unused-var lint via
  // a no-op reference.
  void input.loginHint

  // applicationName MUST be inside sendCode — Zitadel silently ignores it at
  // the root level and the email shows the default "Zitadel Login" instead.
  await call(`/v2/users/${encodeURIComponent(input.userId)}/invite_code`, {
    method: 'POST',
    body: JSON.stringify({
      sendCode: {
        applicationName: input.applicationName ?? 'EZPM',
      },
    }),
  })
  return { sent: true }
}

// ──────────────────────────────────────────────────────────────
// 3. Quick capability check (for graceful degradation)
// ──────────────────────────────────────────────────────────────

export function isConfigured(): boolean {
  return !!TOKEN && !!ORG_ID
}
