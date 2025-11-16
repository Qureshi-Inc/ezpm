'use client'

import { useEffect, useRef, useState } from 'react'

type OnboardingProps = {
  facilitatorAccountId: string
  onSuccess: (accountId: string) => void
  onError?: (error: any) => void
}

export default function MoovOnboardingDrop({
  facilitatorAccountId,
  onSuccess,
  onError
}: OnboardingProps) {
  const dropRef = useRef<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [currentAccountId, setCurrentAccountId] = useState<string | null>(null)

  useEffect(() => {
    const initOnboarding = async () => {
      try {
        console.log('Initializing Moov Onboarding Drop...')

        // Wait for Moov.js to load and register custom elements
        await new Promise<void>((resolve, reject) => {
          const checkMoov = () => {
            if (typeof window !== 'undefined' && window.customElements && window.customElements.get('moov-onboarding')) {
              console.log('Moov.js loaded and onboarding element registered')
              resolve()
            } else {
              setTimeout(checkMoov, 100)
            }
          }
          checkMoov()

          // Timeout after 10 seconds
          setTimeout(() => reject(new Error('Moov.js failed to load')), 10000)
        })

        // Get initial token with onboarding scopes
        const initialToken = await getOnboardingToken('initial')
        if (!initialToken) {
          throw new Error('Failed to get initial onboarding token')
        }

        // Configure the onboarding Drop
        setTimeout(() => {
          const el = dropRef.current
          if (!el) {
            setError('Onboarding Drop element not found')
            setLoading(false)
            return
          }

          console.log('Configuring onboarding Drop')

          el.token = initialToken
          el.facilitatorAccountID = facilitatorAccountId
          el.capabilities = ['send-funds', 'collect-funds'] // For rent payments
          el.paymentMethodTypes = ['bankAccount'] // Focus on ACH
          el.showLogo = true

          // Handle resource creation (account, payment methods, etc.)
          el.onResourceCreated = async ({ resourceType, resource }: any) => {
            console.log('Resource created:', resourceType, resource)

            if (resourceType === 'account') {
              const newAccountId = resource.accountID
              console.log('New account created:', newAccountId)
              setCurrentAccountId(newAccountId)

              // Get new token with account-specific scopes
              const accountToken = await getOnboardingToken('account', newAccountId)
              if (accountToken) {
                el.token = accountToken
                console.log('Updated token with account scopes')
              }
            }
          }

          el.onSuccess = (result: any) => {
            console.log('Onboarding completed successfully:', result)
            if (currentAccountId) {
              onSuccess(currentAccountId)
            }
          }

          el.onError = ({ errorType, error: dropError }: any) => {
            console.error('Onboarding Drop error:', errorType, dropError)
            const errorMessage = `Onboarding failed: ${dropError?.message || errorType}`
            setError(errorMessage)
            onError?.(errorMessage)
          }

          el.onCancel = () => {
            console.log('User canceled onboarding')
            setError(null)
          }

          // This is critical - it actually opens/shows the Drop
          el.open = true
          setLoading(false)
        }, 500) // Give a small delay for the element to be ready

      } catch (err: any) {
        console.error('Error initializing onboarding:', err)
        setError(err.message || 'Failed to initialize onboarding')
        setLoading(false)
      }
    }

    initOnboarding()
  }, [facilitatorAccountId, onSuccess, onError, currentAccountId])

  const getOnboardingToken = async (stage: 'initial' | 'account', accountId?: string): Promise<string | null> => {
    try {
      const params = new URLSearchParams({
        stage,
        facilitatorAccountId
      })

      if (accountId) {
        params.append('accountId', accountId)
      }

      const response = await fetch(`/api/moov/token/onboarding?${params}`)
      if (!response.ok) {
        throw new Error('Failed to fetch onboarding token')
      }

      const data = await response.json()
      return data.token
    } catch (err) {
      console.error('Error fetching onboarding token:', err)
      return null
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
        <span className="ml-3">Loading onboarding...</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-4 border border-red-300 rounded-lg bg-red-50">
        <p className="text-red-800">{error}</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="p-4 border rounded-lg bg-blue-50">
        <p className="text-sm text-blue-800">
          Complete your account setup to start receiving rent payments. This secure process is handled by Moov.
        </p>
      </div>

      {/* This is the actual onboarding Drop element */}
      {/* @ts-ignore - Custom Moov.js web component */}
      <moov-onboarding ref={dropRef} />
    </div>
  )
}