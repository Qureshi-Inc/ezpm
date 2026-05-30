/**
 * Auth.js v5 config — Zitadel OIDC provider.
 *
 * Pattern matches zitadel/example-auth-nextjs (the official Zitadel example).
 * Single OIDC client per D8 — both http://localhost:3000 and
 * https://rent.qureshi.io are registered as redirect URIs on the same Zitadel
 * app. Dev mode is enabled on the Zitadel app to allow the http localhost URL.
 *
 * The session callback fans out into our provisioning route on every login,
 * which is where the local users/tenants rows are created/linked (see
 * app/api/auth/provision/route.ts).
 */

import NextAuth, { type DefaultSession } from 'next-auth'
import Zitadel from 'next-auth/providers/zitadel'

// Augment the session type so consumers get strongly-typed `userId` and `role`
declare module 'next-auth' {
  interface Session {
    user: DefaultSession['user'] & {
      id: string
      role: 'admin' | 'tenant'
      zitadel_subject: string
    }
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    user_id?: string
    role?: 'admin' | 'tenant'
    zitadel_subject?: string
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Zitadel({
      // Auth.js v5 picks up AUTH_ZITADEL_ID and AUTH_ZITADEL_SECRET from env
      // automatically. AUTH_ZITADEL_ISSUER is non-standard but supported here
      // for clarity; falls back to https://auth.kainban.com.
      issuer: process.env.AUTH_ZITADEL_ISSUER || 'https://auth.kainban.com',
      authorization: {
        params: {
          // openid: standard OIDC; profile: name/picture; email: email claim;
          // offline_access: refresh tokens for long sessions.
          scope: 'openid profile email offline_access',
        },
      },
    }),
  ],
  session: {
    strategy: 'jwt',
    // 30 days; tenants only log in once a month, no need for short sessions.
    maxAge: 30 * 24 * 60 * 60,
  },
  pages: {
    // Auth.js redirects unauthenticated users here. We don't render a custom
    // sign-in page — clicking sign-in goes straight to Zitadel via signIn().
    signIn: '/api/auth/signin',
  },
  callbacks: {
    // Called on each request that reads the session. We attach user_id +
    // role + zitadel_subject from the JWT into the public session object.
    async session({ session, token }) {
      if (token.user_id) session.user.id = token.user_id
      if (token.role) session.user.role = token.role
      if (token.zitadel_subject) session.user.zitadel_subject = token.zitadel_subject
      return session
    },

    // Called whenever a JWT is created or updated. On initial sign-in we
    // call our provisioning route to insert (or link) the local users row
    // and bake the resulting user_id + role into the JWT.
    async jwt({ token, account, profile }) {
      // First sign-in: `account` is present. Subsequent calls only have `token`.
      if (account && profile) {
        const sub = (profile.sub as string) || (token.sub as string)
        if (sub) {
          token.zitadel_subject = sub
          // Provision (or look up) the local user. This call is server-side
          // and uses the service-role Supabase client; safe from the JWT
          // callback even though it doesn't have a session yet.
          const provisioned = await provisionUser({
            zitadel_subject: sub,
            email: (profile.email as string) || '',
            first_name: (profile.given_name as string | undefined) ?? null,
            last_name: (profile.family_name as string | undefined) ?? null,
          })
          token.user_id = provisioned.user_id
          token.role = provisioned.role
        }
      }
      return token
    },
  },
})

/**
 * Server-side helper: provision a local user from Zitadel claims.
 * Inlined here (not imported) to keep the auth module self-contained for the
 * edge-friendly Auth.js cold path. The actual DB work lives in lib/provision.ts.
 */
async function provisionUser(claims: {
  zitadel_subject: string
  email: string
  first_name: string | null
  last_name: string | null
}): Promise<{ user_id: string; role: 'admin' | 'tenant' }> {
  // Dynamic import — keeps the @supabase/supabase-js bundle out of the edge
  // middleware runtime where it isn't needed.
  const { provisionUserFromZitadel } = await import('@/lib/provision')
  return provisionUserFromZitadel(claims)
}
