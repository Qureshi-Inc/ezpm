'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { ArrowLeft, AlertCircle } from 'lucide-react'
import Link from 'next/link'
import MoovPaymentMethodsDrop from '@/components/MoovPaymentMethodsDrop'

export default function MoovDropsPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [accountId, setAccountId] = useState<string | null>(null)

  useEffect(() => {
    const initMoovDrops = async () => {
      try {
        console.log('Initializing Moov Drops page...')

        // Check if user has an existing Moov account
        const response = await fetch('/api/tenant/moov-account')
        if (!response.ok) {
          console.log('No existing Moov account, redirecting to setup...')
          router.push('/tenant/onboarding/moov')
          return
        }

        const data = await response.json()
        if (!data.success || !data.moovAccountId) {
          console.log('No Moov account ID found, redirecting to setup...')
          router.push('/tenant/onboarding/moov')
          return
        }

        console.log('Found existing Moov account:', data.moovAccountId)
        setAccountId(data.moovAccountId)
        setLoading(false)

      } catch (err) {
        console.error('Error initializing Moov Drops:', err)
        setError('Failed to initialize payment system. Please try again.')
        setLoading(false)
      }
    }

    initMoovDrops()
  }, [router])

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto" />
          <div>
            <p className="text-lg font-medium">Loading payment system...</p>
            <p className="text-sm text-gray-500 mt-2">Setting up secure payment widget...</p>
          </div>
        </div>
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
            <h1 className="text-3xl font-bold text-gray-900">Add Payment Method</h1>
            <p className="text-gray-600 mt-2">Securely link your bank account for ACH payments</p>
          </div>

          {error && (
            <Alert variant="destructive" className="mb-6">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Add Payment Method</CardTitle>
              <CardDescription>
                Securely link your bank account for ACH payments with 0% fees
              </CardDescription>
            </CardHeader>
            <CardContent>
              {accountId ? (
                <MoovPaymentMethodsDrop moovAccountId={accountId} />
              ) : (
                <div className="text-center py-8">
                  <p className="text-gray-500">Loading your account information...</p>
                </div>
              )}

              <div className="mt-6 text-center">
                <p className="text-sm text-gray-500">
                  Having trouble? You can try the{' '}
                  <Link href="/tenant/onboarding/moov" className="text-blue-600 hover:text-blue-700">
                    manual setup process
                  </Link>
                  {' '}instead.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  )
}