'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

interface PasswordChangeGuardProps {
  children: React.ReactNode
}

export function PasswordChangeGuard({ children }: PasswordChangeGuardProps) {
  const router = useRouter()
  const [isChecking, setIsChecking] = useState(true)
  const [isAuthorized, setIsAuthorized] = useState(false)

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const response = await fetch('/api/auth/me')
        
        if (!response.ok) {
          // Not authenticated, redirect to login
          router.push('/auth/login')
          return
        }

        const data = await response.json()
        
        if (!data.needsPasswordChange) {
          // User doesn't need to change password, redirect to dashboard
          if (data.role === 'admin') {
            router.push('/admin')
          } else {
            router.push('/tenant')
          }
          return
        }

        // User is authenticated and needs to change password
        setIsAuthorized(true)
      } catch (error) {
        console.error('Auth check error:', error)
        router.push('/auth/login')
      } finally {
        setIsChecking(false)
      }
    }

    checkAuth()
  }, [router])

  if (isChecking) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">Checking authentication...</p>
        </div>
      </div>
    )
  }

  if (!isAuthorized) {
    return null // Will redirect
  }

  return <>{children}</>
} 