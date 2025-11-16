'use client'

import { useEffect, useRef, useState } from 'react'

type PaymentMethodsProps = {
  moovAccountId: string
}

export default function MoovPaymentMethodsDrop({ moovAccountId }: PaymentMethodsProps) {
  const dropRef = useRef<any>(null)
  const [token, setToken] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // 1) Fetch a Moov token from your backend
  useEffect(() => {
    if (!moovAccountId) return

    const fetchToken = async () => {
      try {
        console.log('Fetching Moov token for account:', moovAccountId)
        const res = await fetch(`/api/moov/token/payment-methods?accountId=${moovAccountId}`)
        if (!res.ok) {
          throw new Error('Failed to fetch Moov token for payment methods')
        }
        const data = await res.json()
        console.log('Got token successfully')
        setToken(data.token)
      } catch (err: any) {
        console.error('Error fetching token:', err)
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }

    fetchToken()
  }, [moovAccountId])

  // 2) Wire the token + accountID into the Drop once it exists
  useEffect(() => {
    if (!token || !moovAccountId || !dropRef.current) return

    console.log('Configuring Moov Drop with token and account ID')
    const el = dropRef.current as any

    el.token = token
    el.accountID = moovAccountId
    el.paymentMethodTypes = ['bankAccount'] // Focus on ACH for now

    el.onSuccess = (result: any) => {
      console.log('Moov Drop onSuccess:', result)
      // TODO: Save to database via /api/payment-methods/moov/save
    }

    el.onError = ({ errorType, error }: any) => {
      console.error('Moov Drop error:', errorType, error)
      setError(`Payment method linking failed: ${error?.message || errorType}`)
    }

    el.onCancel = () => {
      console.log('User canceled payment method linking')
      setError(null)
    }

    // Optional: Configure Plaid for instant verification (requires additional setup)
    // For now, disable Plaid to avoid configuration errors
    // el.plaid = {
    //   env: 'sandbox',
    //   accountID: moovAccountId,
    //   redirectURL: window.location.origin + '/tenant/payment-methods',
    //   onSuccess: (...args: any[]) => console.log('Plaid success', ...args),
    //   onExit: (...args: any[]) => console.log('Plaid exit', ...args),
    //   onEvent: (...args: any[]) => console.log('Plaid event', ...args),
    // }

  }, [token, moovAccountId])

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
        <span className="ml-3">Loading payment widget...</span>
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
          Your payment information is handled securely by Moov and never stored on our servers.
        </p>
      </div>

      {/* This is the actual Drop element */}
      {/* @ts-ignore - Custom Moov.js web component */}
      <moov-payment-methods ref={dropRef} />
    </div>
  )
}