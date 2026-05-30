/**
 * Edge middleware: enforce auth + role-based access.
 *
 * Auth.js v5 middleware decodes the signed JWE session cookie at the edge
 * (no DB call, no Zitadel round-trip). Unauthenticated requests to
 * /admin or /tenant get redirected to the Auth.js sign-in endpoint which
 * itself redirects to Zitadel.
 *
 * Role gating: authenticated tenants requesting /admin get bounced back to
 * /tenant. The old middleware only checked cookie presence; this one
 * actually validates the role claim.
 */

import { auth } from '@/auth'
import { NextResponse } from 'next/server'

export default auth((req) => {
  const path = req.nextUrl.pathname
  const isAuthed = !!req.auth
  const role = req.auth?.user?.role

  const isAdminRoute = path.startsWith('/admin')
  const isTenantRoute = path.startsWith('/tenant')

  // Unauthenticated → bounce to /auth/start which initiates OIDC server-side
  // (no button-click intermediary). For users with an existing Zitadel session
  // (e.g. just finished invite flow), this silent-SSOs them through.
  if ((isAdminRoute || isTenantRoute) && !isAuthed) {
    const signInUrl = new URL('/auth/start', req.nextUrl.origin)
    signInUrl.searchParams.set('callbackUrl', req.nextUrl.pathname)
    return NextResponse.redirect(signInUrl)
  }

  // Authed tenant trying to hit /admin → push to /tenant.
  if (isAdminRoute && role === 'tenant') {
    return NextResponse.redirect(new URL('/tenant', req.nextUrl.origin))
  }

  // Authed admin trying to hit /tenant pages is fine — admins can preview.
  return NextResponse.next()
})

export const config = {
  matcher: ['/admin/:path*', '/tenant/:path*'],
  // Runs in the Edge runtime by default. Auth.js v5's session decryption uses
  // jose, which warns about CompressionStream not existing in Edge — that
  // path only fires for compressed JWEs (very large tokens) which we don't
  // generate. If you ever see "CompressionStream is not defined" in prod
  // logs, pin runtime: 'nodejs' here AND enable
  // experimental.nodeMiddleware in next.config.ts.
}
