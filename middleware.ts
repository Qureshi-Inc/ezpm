import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname

  // Define protected routes
  const isProtectedRoute = path.startsWith('/admin') || path.startsWith('/tenant')
  const isAuthRoute = path.startsWith('/auth')

  // Get the session token from cookies
  const session = request.cookies.get('session')

  // Redirect to login if accessing protected route without session
  if (isProtectedRoute && !session) {
    return NextResponse.redirect(new URL('/auth/login', request.url))
  }

  // Redirect to appropriate dashboard if accessing auth routes with session
  // BUT allow access to change-password page even with session
  if (isAuthRoute && session && !path.startsWith('/auth/change-password')) {
    // In a real app, you'd decode the session to get the user role
    // For now, we'll just redirect to tenant dashboard
    return NextResponse.redirect(new URL('/tenant', request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/admin/:path*', '/tenant/:path*', '/auth/:path*']
} 