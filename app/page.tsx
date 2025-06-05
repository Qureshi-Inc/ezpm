import { getSession } from '@/lib/auth'
import { redirect } from 'next/navigation'

export default async function Home() {
  const session = await getSession()

  if (!session) {
    redirect('/auth/login')
  }

  if (session.role === 'admin') {
    redirect('/admin')
  } else {
    redirect('/tenant')
  }
}
