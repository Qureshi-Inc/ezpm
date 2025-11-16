'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { ArrowLeft, AlertCircle, CheckCircle } from 'lucide-react'
import Link from 'next/link'

export default function MoovDropsPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [accountId, setAccountId] = useState<string | null>(null)
  const dropRef = useRef<any>(null)

  const setupMoovDrop = useCallback(async (moovAccountId: string) => {
    try {
      console.log('Setting up Moov Drop for account:', moovAccountId)

      // Get JWT token for payment methods
      const tokenResponse = await fetch('/api/moov/token/payment-methods', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ accountId: moovAccountId })
      })

      if (!tokenResponse.ok) {
        const errorData = await tokenResponse.json()
        throw new Error(errorData.error || 'Failed to get authentication token')
      }

      const { token } = await tokenResponse.json()
      console.log('Got payment methods token')

      // Wait for the Drop element to be available in the DOM
      const dropElement = await new Promise<any>((resolve, reject) => {
        const checkElement = () => {
          const element = dropRef.current
          if (element) {
            resolve(element)
          } else {
            // Check again after a short delay
            setTimeout(checkElement, 100)
          }
        }
        checkElement()

        // Timeout after 5 seconds
        setTimeout(() => reject(new Error('Drop element not found after 5 seconds')), 5000)
      })

      dropElement.token = token
      dropElement.accountID = moovAccountId
      dropElement.paymentMethodTypes = ['bankAccount'] // Focus on ACH for now

      // Set up callbacks
      dropElement.onSuccess = async (paymentMethod: any) => {
        console.log('Payment method linked successfully:', paymentMethod)

        try {
          // Save payment method to our database
          const saveResponse = await fetch('/api/payment-methods/moov/save', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              accountId: moovAccountId,
              paymentMethod
            })
          })

          if (!saveResponse.ok) {
            throw new Error('Failed to save payment method')
          }

          setSuccess(true)
          setError(null)

          // Redirect after short delay
          setTimeout(() => {
            router.push('/tenant/payment-methods')
          }, 2000)

        } catch (err) {
          console.error('Error saving payment method:', err)
          setError('Payment method linked but failed to save. Please contact support.')
        }
      }

      dropElement.onError = ({ errorType, error }: any) => {
        console.error('Moov Drop error:', errorType, error)
        setError(`Payment method linking failed: ${error?.message || errorType}`)
      }

      dropElement.onCancel = () => {
        console.log('User canceled payment method linking')
        // Just hide any error messages, don't show a new error
        setError(null)
      }

      // Optional: Configure Plaid for instant verification
      dropElement.plaid = {
        env: 'sandbox', // Change to undefined for production
        onSuccess: (...args: any[]) => console.log('Plaid success', ...args),
        onExit: (...args: any[]) => console.log('Plaid exit', ...args),
        onEvent: (...args: any[]) => console.log('Plaid event', ...args),
      }

      // Show the drop
      dropElement.open = true

      setLoading(false)

    } catch (err: any) {
      console.error('Error setting up Moov Drop:', err)
      setError(err.message || 'Failed to setup payment method widget')
      setLoading(false)
    }
  }, [router])

  useEffect(() => {
    const initMoovDrops = async () => {
      try {
        console.log('Initializing Moov Drops...')

        // Wait for Moov.js to load and register custom elements
        await new Promise<void>((resolve, reject) => {
          const checkMoov = () => {
            if (typeof window !== 'undefined' && window.customElements && window.customElements.get('moov-payment-methods')) {
              console.log('Moov.js loaded and payment-methods element registered')
              resolve()
            } else {
              setTimeout(checkMoov, 100)
            }
          }
          checkMoov()

          // Timeout after 10 seconds
          setTimeout(() => reject(new Error('Moov.js failed to load')), 10000)
        })

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

        // Setup the Moov Drop for payment methods
        await setupMoovDrop(data.moovAccountId)

      } catch (err) {
        console.error('Error initializing Moov Drops:', err)
        setError('Failed to initialize payment system. Please try again.')
        setLoading(false)
      }
    }

    initMoovDrops()
  }, [router, setupMoovDrop])

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

          {success && (
            <Alert className="mb-6 border-green-200 bg-green-50">
              <CheckCircle className="h-4 w-4 text-green-600" />
              <AlertDescription className="text-green-800">
                Payment method linked successfully! Redirecting you to your payment methods...
              </AlertDescription>
            </Alert>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Secure Payment Method Setup</CardTitle>
              <CardDescription>
                Your payment information is handled securely by Moov and never stored on our servers
              </CardDescription>
            </CardHeader>
            <CardContent>
              {/* Moov Payment Methods Drop */}
              {/* @ts-ignore - Custom Moov.js element */}
              <moov-payment-methods
                id="moov-payment-methods"
                ref={dropRef}
              />

              {!loading && !success && (
                <div className="mt-6 text-center">
                  <p className="text-sm text-gray-500">
                    Having trouble? You can try the{' '}
                    <Link href="/tenant/onboarding/moov" className="text-blue-600 hover:text-blue-700">
                      manual setup process
                    </Link>
                    {' '}instead.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  )
}