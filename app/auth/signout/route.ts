/**
 * GET /auth/signout
 *
 * Federated logout. Clears both:
 *   1. Auth.js session cookie on app.getezpm.com
 *   2. Zitadel session cookie on auth.getezpm.com
 *
 * Without step 2, our app's "Logout" button is a no-op from the user's
 * perspective: signing out of Auth.js immediately bounces them through
 * /auth/start which silent-SSO's via the still-alive Zitadel session,
 * landing them right back where they started.
 *
 * Flow:
 *   1. Read the stored id_token from the JWT (saved during sign-in by the
 *      jwt callback in auth.ts). Zitadel's end_session endpoint requires
 *      id_token_hint to authenticate the logout AND to honor
 *      post_logout_redirect_uri.
 *   2. signOut() clears our Auth.js cookies (with redirect: false so we
 *      can chain into the Zitadel logout instead of bailing here).
 *   3. Redirect the browser to Zitadel's end_session endpoint.
 *   4. Zitadel terminates its session, then redirects to
 *      post_logout_redirect_uri (must be in the OIDC app's allowed
 *      postLogoutRedirectUris list — currently https://app.getezpm.com).
 *   5. The user lands back on our home page. Since there's no session
 *      AND no Zitadel session, /auth/start will show the login form
 *      instead of silent-SSO'ing.
 *
 * If id_token isn't available (e.g. very old session predating the
 * jwt-callback change), we still clear our cookie and redirect to
 * Zitadel's logout — Zitadel may refuse to honor post_logout_redirect_uri
 * without id_token_hint, in which case the user lands on Zitadel's own
 * "logged out" page. Still logged out, just less polished.
 */

import { signOut } from '@/auth'
import { getToken } from 'next-auth/jwt'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const issuer = (process.env.AUTH_ZITADEL_ISSUER || 'https://auth.getezpm.com').replace(/\/$/, '')
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || 'https://app.getezpm.com').replace(/\/$/, '')
  const clientId = process.env.AUTH_ZITADEL_ID || ''

  // Read id_token BEFORE clearing the session cookie.
  const token = await getToken({
    req: request,
    secret: process.env.AUTH_SECRET,
    secureCookie: true,
  })
  const idToken = token?.id_token as string | undefined

  // Build the Zitadel end_session URL.
  const endSessionUrl = new URL(`${issuer}/oidc/v1/end_session`)
  endSessionUrl.searchParams.set('post_logout_redirect_uri', appUrl)
  if (clientId) endSessionUrl.searchParams.set('client_id', clientId)
  if (idToken) endSessionUrl.searchParams.set('id_token_hint', idToken)

  // Clear Auth.js cookies on our origin. signOut with redirect: false sets
  // the Set-Cookie clear headers on the response, then returns; the
  // subsequent NextResponse.redirect carries them through.
  await signOut({ redirect: false })

  return NextResponse.redirect(endSessionUrl.toString())
}

// Some logout libraries POST instead of GET; accept both for safety.
export const POST = GET
