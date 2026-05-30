/**
 * Compat shim over Auth.js v5.
 *
 * The rest of the codebase (server components, route handlers) imports
 * { getSession, requireAuth, requireAdmin, getCurrentUser, getCurrentTenant }
 * from here. Those names predate the Auth.js migration; keeping them stable
 * means none of the callers need to change shape, only the internals.
 *
 * Auth.js's auth() returns the full Session object; we narrow it to the
 * SessionUser shape the rest of the app already expects.
 */

import { auth } from '@/auth'
import { createServerSupabaseClient } from './supabase'

export interface SessionUser {
  userId: string
  email: string
  role: 'admin' | 'tenant'
  zitadel_subject: string
}

export async function getSession(): Promise<SessionUser | null> {
  const session = await auth()
  if (!session?.user?.id || !session.user.email) {
    return null
  }
  return {
    userId: session.user.id,
    email: session.user.email,
    role: session.user.role,
    zitadel_subject: session.user.zitadel_subject,
  }
}

export async function requireAuth(): Promise<SessionUser> {
  const session = await getSession()
  if (!session) {
    throw new Error('Unauthorized')
  }
  return session
}

export async function requireAdmin(): Promise<SessionUser> {
  const session = await requireAuth()
  if (session.role !== 'admin') {
    throw new Error('Forbidden')
  }
  return session
}

export async function getCurrentUser() {
  const session = await getSession()
  if (!session) return null

  const supabase = createServerSupabaseClient()
  const { data: user } = await supabase
    .from('users')
    .select('*')
    .eq('id', session.userId)
    .maybeSingle()

  return user
}

export async function getCurrentTenant() {
  const session = await getSession()
  if (!session || session.role !== 'tenant') return null

  const supabase = createServerSupabaseClient()
  const { data: tenant } = await supabase
    .from('tenants')
    .select('*, property:properties(*)')
    .eq('user_id', session.userId)
    .maybeSingle()

  return tenant
}
