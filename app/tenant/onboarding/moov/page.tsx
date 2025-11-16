'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { ArrowLeft, CheckCircle, AlertCircle } from 'lucide-react'
import Link from 'next/link'
import MoovOnboardingDrop from '@/components/MoovOnboardingDrop'

export default function MoovOnboardingPage() {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const handleOnboardingSuccess = async (accountId: string) => {
    try {
      console.log('Onboarding completed, saving account ID:', accountId)

      // Save the Moov account ID to the tenant record
      const response = await fetch('/api/tenant/moov-account', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ moovAccountId: accountId })
      })

      if (!response.ok) {
        throw new Error('Failed to save Moov account')
      }

      setSuccess(true)
      setError(null)

      // Redirect to payment methods after success
      setTimeout(() => {
        router.push('/tenant/payment-methods')
      }, 2000)

    } catch (err: any) {
      console.error('Error saving Moov account:', err)
      setError('Account created but failed to save. Please contact support.')
    }
  }

  const handleOnboardingError = (error: any) => {
    setError(error)
  }

  // Get facilitator account ID from environment
  const facilitatorAccountId = process.env.NEXT_PUBLIC_MOOV_FACILITATOR_ACCOUNT_ID

  if (!facilitatorAccountId) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Alert variant="destructive" className="max-w-md">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Configuration error: Moov facilitator account ID not found.
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <main className="max-w-4xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          <div className="mb-6">
            <Link href="/tenant/payment-methods" className="flex items-center text-blue-600 hover:text-blue-700 mb-4">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Payment Methods
            </Link>
            <h1 className="text-3xl font-bold text-gray-900">Complete Your Account Setup</h1>
            <p className="text-gray-600 mt-2">Set up your account to start receiving rent payments securely</p>
          </div>

          {error && (
            <Alert variant="destructive" className="mb-6">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {success && (
            <Alert className="mb-6 border-green-200 bg-green-50">
              <CheckCircle className="h-4 w-4 text-green-600" />
              <AlertDescription className="text-green-800">
                Account setup completed successfully! Redirecting you to payment methods...
              </AlertDescription>
            </Alert>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Account Onboarding</CardTitle>
              <CardDescription>
                Complete your account verification with our secure onboarding process.
                This includes identity verification and payment method setup.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <MoovOnboardingDrop
                facilitatorAccountId={facilitatorAccountId}
                onSuccess={handleOnboardingSuccess}
                onError={handleOnboardingError}
              />
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  )
}