'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { ArrowLeft, CheckCircle, AlertCircle } from 'lucide-react'
import Link from 'next/link'

export default function MoovOnboardingPage() {
  const router = useRouter()
  const onboardingRef = useRef<any>(null)
  const accountIdRef = useRef<string | null>(null) // Use ref to avoid stale closure issues
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [accountCreated, setAccountCreated] = useState(false)
  const [newAccountId, setNewAccountId] = useState<string | null>(null)
  const [existingAccountId, setExistingAccountId] = useState<string | null>(null)

  // Load Moov.js script
  useEffect(() => {
    const script = document.createElement('script')
    script.src = 'https://js.moov.io/'
    script.async = true
    script.onload = () => {
      setLoading(false)
      initializeOnboarding()
    }
    script.onerror = () => {
      setError('Failed to load Moov onboarding')
      setLoading(false)
    }
    document.head.appendChild(script)

    return () => {
      document.head.removeChild(script)
    }
  }, [])

  // Get initial token with facilitator scopes
  const getInitialToken = async () => {
    try {
      const response = await fetch('/api/moov/onboarding-token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          scopes: [
            '/accounts.write',
            `/accounts/${process.env.NEXT_PUBLIC_MOOV_FACILITATOR_ACCOUNT_ID}/profile.read`,
            '/fed.read',
            '/profile-enrichment.read'
          ]
        })
      })

      if (!response.ok) {
        throw new Error('Failed to get onboarding token')
      }

      const data = await response.json()
      return data.token
    } catch (err) {
      console.error('Failed to get initial token:', err)
      setError('Failed to initialize onboarding')
      return null
    }
  }

  // Get updated token with account-specific scopes
  const getAccountToken = async (accountId: string) => {
    try {
      const response = await fetch('/api/moov/onboarding-token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          accountId,
          scopes: [
            '/accounts.write',
            `/accounts/${process.env.NEXT_PUBLIC_MOOV_FACILITATOR_ACCOUNT_ID}/profile.read`,
            '/fed.read',
            '/profile-enrichment.read',
            `/accounts/${accountId}/bank-accounts.read`,
            `/accounts/${accountId}/bank-accounts.write`,
            `/accounts/${accountId}/capabilities.read`,
            `/accounts/${accountId}/capabilities.write`,
            `/accounts/${accountId}/cards.read`,
            `/accounts/${accountId}/cards.write`,
            `/accounts/${accountId}/profile.read`,
            `/accounts/${accountId}/profile.write`,
            `/accounts/${accountId}/representatives.read`,
            `/accounts/${accountId}/representatives.write`,
            `/accounts/${accountId}/transfers.read`,
            `/accounts/${accountId}/transfers.write`,
            `/accounts/${accountId}/wallets.read`,
            `/accounts/${accountId}/wallets.write`
          ]
        })
      })

      if (!response.ok) {
        throw new Error('Failed to get account token')
      }

      const data = await response.json()
      return data.token
    } catch (err) {
      console.error('Failed to get account token:', err)
      return null
    }
  }

  const initializeOnboarding = async () => {
    // First, check if tenant already has a Moov account
    try {
      const tenantResponse = await fetch('/api/tenant/moov-account', {
        method: 'GET',
      })
      
      if (tenantResponse.ok) {
        const tenantData = await tenantResponse.json()
        if (tenantData.moovAccountId) {
          console.log('Tenant already has Moov account:', tenantData.moovAccountId)
          setExistingAccountId(tenantData.moovAccountId)
          setNewAccountId(tenantData.moovAccountId) // Also set newAccountId for consistency
          accountIdRef.current = tenantData.moovAccountId // Store in ref for immediate access
          setAccountCreated(true) // Mark account as already created
        }
      }
    } catch (err) {
      console.error('Failed to fetch tenant Moov account:', err)
    }

    const initialToken = await getInitialToken()
    if (!initialToken) return

    setToken(initialToken)

    // If we have an existing account, get an account-specific token
    let finalToken = initialToken
    if (existingAccountId) {
      const accountToken = await getAccountToken(existingAccountId)
      if (accountToken) {
        finalToken = accountToken
        setToken(accountToken)
      }
    }

    if (onboardingRef.current) {
      const onboarding = onboardingRef.current

      // Set properties
      onboarding.token = finalToken
      onboarding.facilitatorAccountID = process.env.NEXT_PUBLIC_MOOV_FACILITATOR_ACCOUNT_ID
      onboarding.capabilities = ['transfers', 'send-funds', 'collect-funds', 'wallet'] // ACH capabilities including collect-funds for micro-deposits
      onboarding.paymentMethodTypes = ['bankAccount'] // Only bank accounts for ACH
      onboarding.microDeposits = true // Enable micro-deposit verification
      onboarding.showLogo = false
      
      // If we have an existing account, set it
      if (existingAccountId) {
        onboarding.accountID = existingAccountId
      }

      // Pre-populate with user data if available
      // You would fetch this from your database
      onboarding.accountData = {
        accountType: 'individual',
        profile: {
          individual: {
            // These would come from your tenant data
            // firstName: tenant.firstName,
            // lastName: tenant.lastName,
            // email: tenant.email
          }
        }
      }

      // Handle resource creation
      onboarding.onResourceCreated = async ({ resourceType, resource }: any) => {
        console.log('Resource created:', resourceType, resource)

        if (resourceType === 'account') {
          setAccountCreated(true)
          setNewAccountId(resource.accountID)
          accountIdRef.current = resource.accountID // Store in ref for immediate access

          // Get new token with account-specific scopes
          const accountToken = await getAccountToken(resource.accountID)
          if (accountToken) {
            onboarding.token = accountToken
          }

          // Save account ID to your database
          await fetch('/api/tenant/moov-account', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              moovAccountId: resource.accountID
            })
          })
        }

        // Handle bank account creation
        if (resourceType === 'bankAccount') {
          console.log('Bank account created:', resource)
          console.log('Full bank account resource:', JSON.stringify(resource, null, 2))
          
          // Save the bank account as a payment method
          try {
            // Use ref first for most up-to-date value, then fall back to state
            // Also check if resource has account ID in different fields
            const moovAccountId = accountIdRef.current || newAccountId || existingAccountId || resource.accountID || resource.account_id
            console.log('Saving bank account with Moov account ID:', moovAccountId)
            console.log('Account IDs available:', { 
              refAccountId: accountIdRef.current,
              newAccountId, 
              existingAccountId, 
              resourceAccountId: resource.accountID 
            })
            
            // If we still don't have an account ID, we need to handle this
            if (!moovAccountId) {
              console.error('ERROR: No Moov account ID available when saving bank account!')
              console.error('This should not happen - please check the flow')
              // Try to get it from the resource or show an error
              setError('Unable to save payment method - missing account information. Please try again.')
              return
            }
            
            const response = await fetch('/api/tenant/payment-methods/save-moov-bank', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                moovAccountId,
                bankAccountId: resource.bankAccountID,
                last4: resource.lastFourAccountNumber || '****'
              })
            })

            if (response.ok) {
              console.log('Bank account saved as payment method')
              
              // Redirect to verification page if micro-deposits are needed
              const accountId = accountIdRef.current || newAccountId || existingAccountId
              if (resource.status === 'new' || resource.status === 'pending') {
                router.push(`/tenant/payment-methods/verify-micro-deposits?accountId=${accountId}&bankAccountId=${resource.bankAccountID}&last4=${resource.lastFourAccountNumber || '****'}`)
              } else if (resource.status === 'verified') {
                // If already verified (test accounts), go to payment methods
                router.push('/tenant/payment-methods')
              }
            }
          } catch (error) {
            console.error('Failed to save bank account:', error)
          }
        }
      }

      // Handle errors
      onboarding.onError = (error: any) => {
        console.error('Onboarding error:', error)
        setError(error.message || 'An error occurred during onboarding')
      }

      // Handle cancellation
      onboarding.onCancel = () => {
        console.log('Onboarding cancelled')
        router.push('/tenant/payment-methods')
      }

      // Handle success
      onboarding.onSuccess = async (account: any) => {
        console.log('Onboarding successful!', account)
        
        // Show success message
        setError(null)
        
        // Redirect after a moment
        setTimeout(() => {
          router.push('/tenant/payment-methods')
        }, 2000)
      }
    }
  }

  const openOnboarding = () => {
    if (onboardingRef.current) {
      onboardingRef.current.open = true
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p>Loading Moov onboarding...</p>
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
            <h1 className="text-3xl font-bold text-gray-900">Set Up ACH Payments</h1>
            <p className="text-gray-600 mt-2">Complete your account setup to enable ACH bank transfers</p>
          </div>

          {error && (
            <Alert variant="destructive" className="mb-6">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {accountCreated && !error && (
            <Alert className="mb-6 border-green-200 bg-green-50">
              <CheckCircle className="h-4 w-4 text-green-600" />
              <AlertDescription className="text-green-800">
                Account created successfully! Continue to add your bank account.
              </AlertDescription>
            </Alert>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Moov Account Setup</CardTitle>
              <CardDescription>
                Set up your Moov account to enable ACH payments with no processing fees
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <h3 className="font-medium text-blue-900 mb-2">What you'll need:</h3>
                  <ul className="text-sm text-blue-800 space-y-1">
                    <li>• Your legal name and address</li>
                    <li>• Date of birth</li>
                    <li>• Last 4 digits of SSN (for verification)</li>
                    <li>• Bank account and routing numbers</li>
                  </ul>
                </div>

                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <h3 className="font-medium text-green-900 mb-2">Benefits of ACH Payments:</h3>
                  <ul className="text-sm text-green-800 space-y-1">
                    <li>• No processing fees - pay exactly your rent amount</li>
                    <li>• Automatic payments from your bank account</li>
                    <li>• Secure and reliable transfers</li>
                    <li>• Typically processes in 1-3 business days</li>
                  </ul>
                </div>

                <Button 
                  onClick={openOnboarding}
                  className="w-full"
                  size="lg"
                >
                  Start Setup
                </Button>

                <p className="text-xs text-gray-500 text-center">
                  By continuing, you agree to Moov's Terms of Service and Privacy Policy.
                  Your information is encrypted and securely processed by Moov, a licensed money transmitter.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Hidden Moov Onboarding element */}
          {/* @ts-ignore - Moov custom element */}
          <moov-onboarding
            ref={onboardingRef}
            token={token}
            facilitator-account-id={process.env.NEXT_PUBLIC_MOOV_FACILITATOR_ACCOUNT_ID}
          />
        </div>
      </main>
    </div>
  )
}
