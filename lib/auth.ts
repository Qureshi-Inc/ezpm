import { cookies } from 'next/headers'
import { createServerSupabaseClient } from './supabase'

interface SessionUser {
  userId: string
  email: string
  role: 'admin' | 'tenant'
}

export async function getSession(): Promise<SessionUser | null> {
  try {
    const cookieStore = await cookies()
    const sessionToken = cookieStore.get('session')

    if (!sessionToken) {
      return null
    }

    // Decode session token
    const sessionData = JSON.parse(
      Buffer.from(sessionToken.value, 'base64').toString('utf-8')
    )

    return sessionData as SessionUser
  } catch (error) {
    console.error('Session error:', error)
    return null
  }
}

export async function requireAuth() {
  const session = await getSession()
  
  if (!session) {
    throw new Error('Unauthorized')
  }

  return session
}

export async function requireAdmin() {
  const session = await requireAuth()
  
  if (session.role !== 'admin') {
    throw new Error('Forbidden')
  }

  return session
}

export async function getCurrentUser() {
  const session = await getSession()
  
  if (!session) {
    return null
  }

  const supabase = createServerSupabaseClient()
  
  const { data: user, error } = await supabase
    .from('users')
    .select('*')
    .eq('id', session.userId)
    .single()

  if (error || !user) {
    return null
  }

  return user
}

export async function getCurrentTenant() {
  const session = await getSession()
  
  if (!session || session.role !== 'tenant') {
    return null
  }

  const supabase = createServerSupabaseClient()
  
  const { data: tenant, error } = await supabase
    .from('tenants')
    .select('*, property:properties(*)')
    .eq('user_id', session.userId)
    .single()

  if (error || !tenant) {
    return null
  }

  return tenant
} 