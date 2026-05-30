/**
 * Auth.js v5 mounts its endpoint handlers (sign-in, callback, sign-out,
 * session, CSRF, providers) on this catch-all route. Auth.js auto-generates:
 *   GET  /api/auth/signin          -> redirects to Zitadel
 *   GET  /api/auth/callback/zitadel -> handles the OIDC code exchange
 *   GET  /api/auth/session         -> returns the current session JSON
 *   POST /api/auth/signout         -> clears the session cookie
 *   etc.
 */

import { handlers } from '@/auth'

export const { GET, POST } = handlers
