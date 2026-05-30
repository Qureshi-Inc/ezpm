import { getSession } from '@/lib/auth'
import { redirect } from 'next/navigation'

export default async function Home() {
  const session = await getSession()

  if (!session) {
    // Auth.js sign-in handler kicks off the OIDC flow to Zitadel
    redirect('/api/auth/signin?callbackUrl=/')
  }

  redirect(session.role === 'admin' ? '/admin' : '/tenant')
}
