/**
 * POST /api/auth/invite/complete
 *
 * Called from the /auth/invite page when a tenant submits the password
 * setup form. Verifies the invitation code with Zitadel (which also marks
 * the email verified) and sets the chosen password.
 *
 * Body: { userId: string, code: string, password: string }
 *
 * On success, returns 200. The client then redirects to the Auth.js
 * sign-in endpoint where the tenant logs in with the password they just
 * set, completing the OIDC flow and landing on /tenant.
 *
 * This route is intentionally UNAUTHENTICATED — the invite code IS the
 * proof of identity. Zitadel rejects invalid/expired codes server-side.
 */

import { NextRequest, NextResponse } from 'next/server'
import * as zitadel from '@/lib/zitadel'

function validatePassword(password: string): string | null {
  if (typeof password !== 'string' || password.length < 8) {
    return 'Password must be at least 8 characters'
  }
  if (!/[A-Z]/.test(password)) return 'Password needs an uppercase letter'
  if (!/[a-z]/.test(password)) return 'Password needs a lowercase letter'
  if (!/[0-9]/.test(password)) return 'Password needs a number'
  return null
}

export async function POST(request: NextRequest) {
  try {
    if (!zitadel.isConfigured()) {
      return NextResponse.json(
        { error: 'Zitadel admin integration is not configured on this server.' },
        { status: 503 },
      )
    }

    const { userId, code, password } = await request.json()
    if (!userId || !code || !password) {
      return NextResponse.json(
        { error: 'userId, code, and password are all required' },
        { status: 400 },
      )
    }

    const pwErr = validatePassword(password)
    if (pwErr) {
      return NextResponse.json({ error: pwErr }, { status: 400 })
    }

    // Step 1: verify the email + invitation code in one call.
    // Zitadel marks the email verified and consumes the code; replays
    // throw "code already used" or "invalid".
    try {
      await zitadel.verifyEmailWithCode({ userId, code })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Verification failed'
      return NextResponse.json(
        {
          error: /expired/i.test(msg)
            ? 'This invite link has expired. Ask the property manager to send a new one.'
            : /invalid|incorrect/i.test(msg)
              ? 'This invite link is invalid or already used.'
              : msg,
        },
        { status: 400 },
      )
    }

    // Step 2: set the password as the service user (no old password required).
    try {
      await zitadel.setPassword({ userId, newPassword: password })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to set password'
      // Password rejected by Zitadel's complexity policy → surface the
      // Zitadel-side message so the tenant can fix and retry.
      return NextResponse.json({ error: msg }, { status: 400 })
    }

    return NextResponse.json({
      success: true,
      message: 'Password set. You can now sign in.',
    })
  } catch (error) {
    console.error('Invite complete error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 },
    )
  }
}
