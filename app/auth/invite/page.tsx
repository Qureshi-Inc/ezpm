/**
 * Tenant invite acceptance page.
 *
 * URL: /auth/invite?code=<verification_code>&userId=<zitadel_user_id>
 *
 * Reached from the Zitadel invitation email (urlTemplate was set in
 * /api/admin/tenants when the admin created the tenant). Renders a
 * branded password-setup form. On submit, POSTs to
 * /api/auth/invite/complete which verifies the code with Zitadel and
 * sets the password. Then the tenant signs in normally.
 */

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { AcceptInviteForm } from '@/components/forms/AcceptInviteForm'
import { Home, AlertCircle } from 'lucide-react'

interface InvitePageProps {
  searchParams: Promise<{ code?: string; userId?: string }>
}

export default async function InvitePage({ searchParams }: InvitePageProps) {
  const params = await searchParams
  const code = params.code?.trim()
  const userId = params.userId?.trim()

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="relative z-10 w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-600 rounded-full shadow-lg mb-4">
            <Home className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900">Welcome to EZPM</h1>
          <p className="text-gray-600 mt-2">Set up your tenant account</p>
        </div>

        <Card className="shadow-2xl border-0 bg-white/90 backdrop-blur-sm">
          {!code || !userId ? (
            <CardContent className="pt-8 pb-6 text-center space-y-3">
              <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto">
                <AlertCircle className="w-6 h-6 text-red-600" />
              </div>
              <h2 className="text-lg font-medium text-gray-900">Invalid invite link</h2>
              <p className="text-sm text-gray-600">
                The invite link is missing required information. Please use the link from your invite email,
                or ask your property manager to send a new one.
              </p>
            </CardContent>
          ) : (
            <>
              <CardHeader className="text-center pb-4">
                <CardTitle className="text-xl">Set your password</CardTitle>
                <CardDescription>
                  This is the password you&apos;ll use to log in to the rent portal.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <AcceptInviteForm userId={userId} code={code} />
              </CardContent>
            </>
          )}
        </Card>

        <p className="text-center mt-6 text-xs text-gray-500">
          Trouble signing in? Contact your property manager.
        </p>
      </div>
    </div>
  )
}
