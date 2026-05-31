/**
 * GET /auth/start?callbackUrl=...
 *
 * Server-side OIDC kick-off. Auth.js's default sign-in page at
 * /api/auth/signin renders a "Sign in with Zitadel" button and waits for a
 * click. That extra click is friction for everyone and especially confusing
 * for new tenants who just finished the invite + password flow on Zitadel's
 * hosted UI and got dumped back at our root.
 *
 * This route handler calls signIn('zitadel') server-side which Auth.js
 * translates into a 302 redirect to Zitadel's OIDC authorize endpoint (with
 * PKCE + state cookies generated automatically). Two outcomes:
 *
 *   1. User has an existing Zitadel session (e.g. just finished the invite
 *      flow) → Zitadel silent-SSOs them and bounces them back to
 *      /api/auth/callback/zitadel → session created → land on callbackUrl.
 *
 *   2. User has no session → Zitadel shows its login form → after auth →
 *      same callback path.
 *
 * Either way, zero buttons to click. The home page + middleware redirect
 * here instead of /api/auth/signin.
 */

import { signIn } from '@/auth'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const callbackUrl = request.nextUrl.searchParams.get('callbackUrl') || '/'

  // login_hint (optional): when present, gets forwarded to Zitadel's OIDC
  // authorize as an `login_hint` parameter. This pre-fills the username on the
  // Zitadel V2 login form AND tells Zitadel which user is signing in BEFORE
  // they enter anything — critical for the invite flow, where Zitadel needs
  // to know which user has a pending invite_code so it can show the verify
  // page instead of the generic login form.
  const loginHint = request.nextUrl.searchParams.get('login_hint') || undefined

  // signIn() throws a NEXT_REDIRECT internally that Next.js converts to a 302.
  // It does not return — the line below is only reached if Auth.js misbehaves.
  //
  // Third arg = OIDC authorizationParams. Auth.js v5 merges these into the
  // /oauth/v2/authorize URL alongside the auto-generated state + PKCE.
  await signIn(
    'zitadel',
    { redirectTo: callbackUrl },
    loginHint ? { login_hint: loginHint } : undefined,
  )
  return NextResponse.json(
    { error: 'signIn did not redirect — Auth.js misconfigured?' },
    { status: 500 },
  )
}
