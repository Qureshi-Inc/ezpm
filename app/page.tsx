import { getSession } from '@/lib/auth'
import { redirect } from 'next/navigation'

export default async function Home() {
  const session = await getSession()

  if (!session) {
    // /auth/start initiates the OIDC flow server-side (no button to click).
    // Tenants who just finished the Zitadel invite + password setup get
    // silent-SSO'd through OIDC and land directly on /tenant.
    redirect('/auth/start?callbackUrl=/')
  }

  redirect(session.role === 'admin' ? '/admin' : '/tenant')
}
