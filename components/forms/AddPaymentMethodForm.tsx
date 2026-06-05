'use client'

/**
 * AddPaymentMethodForm — replaces the old raw-card form (PCI risk) AND the
 * Moov bank-account onboarding drop with a single Stripe PaymentElement
 * flow that handles both card and us_bank_account.
 *
 * Flow:
 *  1. Server creates a SetupIntent for the tenant's Stripe Customer
 *     (via /api/tenant/payment-methods/setup-intent).
 *  2. Stripe Elements renders the PaymentElement which auto-routes to the
 *     right UI per type (card form vs. Financial Connections for bank).
 *  3. On submit, stripe.confirmSetup() attaches the PaymentMethod to the
 *     customer.
 *  4. The on_setup_intent.succeeded webhook OR the page's success handler
 *     persists the local payment_methods row by POSTing to
 *     /api/tenant/payment-methods.
 *
 * For ezpm we do the persist inline (post-confirmSetup) rather than via
 * webhook so the tenant UI updates immediately. The webhook is a backstop.
 */

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from '@stripe/react-stripe-js'
import { getStripe } from '@/lib/stripe-client'
import { Button } from '@/components/ui/button'
import { AlertCircle, Loader2 } from 'lucide-react'

interface AddPaymentMethodFormProps {
  tenantId: string
}

interface SetupIntentResponse {
  clientSecret: string
  stripeCustomerId: string
}

function PaymentElementForm({ stripeCustomerId }: { stripeCustomerId: string }) {
  const stripe = useStripe()
  const elements = useElements()
  const router = useRouter()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!stripe || !elements) {
      setError('Stripe has not loaded yet. Try again in a moment.')
      return
    }
    setIsSubmitting(true)
    setError('')

    const { error: confirmError, setupIntent } = await stripe.confirmSetup({
      elements,
      redirect: 'if_required',
      confirmParams: {
        // Return URL is required by Stripe even when redirect: 'if_required'
        // because some bank flows DO redirect (e.g. instant verification).
        return_url: `${window.location.origin}/tenant/payment-methods`,
      },
    })

    if (confirmError) {
      setError(confirmError.message || 'Failed to save payment method')
      setIsSubmitting(false)
      return
    }
    if (!setupIntent) {
      setError('No setup intent returned from Stripe')
      setIsSubmitting(false)
      return
    }

    // Two acceptable terminal states:
    //   succeeded          → instant (card; us_bank_account via Financial Connections)
    //   requires_action +  → us_bank_account via manual routing/account entry.
    //   verify_with_micro    The PM is attached and a SetupIntent is "live"; tenant
    //   deposits             must come back and enter 2 cent amounts to verify.
    const isInstantSuccess = setupIntent.status === 'succeeded'
    const isPendingMicrodeposits =
      setupIntent.status === 'requires_action' &&
      setupIntent.next_action?.type === 'verify_with_microdeposits'

    if (!isInstantSuccess && !isPendingMicrodeposits) {
      setError(`Payment method setup did not succeed (status: ${setupIntent.status})`)
      setIsSubmitting(false)
      return
    }

    const paymentMethodId = typeof setupIntent.payment_method === 'string'
      ? setupIntent.payment_method
      : setupIntent.payment_method?.id
    if (!paymentMethodId) {
      setError('No payment method returned from Stripe')
      setIsSubmitting(false)
      return
    }

    // Retrieve the PM to grab last4 / brand / bank_name for the local mirror.
    // For microdeposit-pending PMs the PM isn't attached to the customer yet,
    // so we look it up via the SetupIntent (which always has the customer set).
    const pmDetailsResp = await fetch('/api/tenant/payment-methods/details', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        paymentMethodId,
        setupIntentId: setupIntent.id,
      }),
    })
    const pmDetails = await pmDetailsResp.json()
    if (!pmDetailsResp.ok) {
      setError(pmDetails.error || 'Failed to read payment method details')
      setIsSubmitting(false)
      return
    }

    const persistResp = await fetch('/api/tenant/payment-methods', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        stripePaymentMethodId: paymentMethodId,
        type: pmDetails.type,
        last4: pmDetails.last4,
        brand: pmDetails.brand,
        bankName: pmDetails.bankName,
        verificationStatus: isPendingMicrodeposits ? 'pending_microdeposits' : 'verified',
        setupIntentId: isPendingMicrodeposits ? setupIntent.id : undefined,
      }),
    })
    const persistData = await persistResp.json()
    if (!persistResp.ok) {
      setError(persistData.error || 'Failed to save payment method')
      setIsSubmitting(false)
      return
    }

    // Manual-entry ACH → bounce to the verify page instead of the list.
    if (persistData.requiresVerification && persistData.paymentMethod?.id) {
      router.push(`/tenant/payment-methods/${persistData.paymentMethod.id}/verify`)
    } else {
      router.push('/tenant/payment-methods')
    }
    router.refresh()
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="p-3 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-lg flex items-center space-x-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <PaymentElement
        options={{
          // Show both card and us_bank_account, default to bank since ACH is
          // dramatically cheaper for monthly rent.
          paymentMethodOrder: ['us_bank_account', 'card'],
          layout: 'tabs',
        }}
      />

      <div className="flex space-x-4 pt-2">
        <Button type="submit" disabled={!stripe || isSubmitting} className="flex-1">
          {isSubmitting ? (
            <span className="inline-flex items-center">
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Saving...
            </span>
          ) : (
            'Save Payment Method'
          )}
        </Button>
        <Button
          type="button"
          variant="outline"
          className="flex-1"
          onClick={() => router.push('/tenant/payment-methods')}
          disabled={isSubmitting}
        >
          Cancel
        </Button>
      </div>
    </form>
  )
}

export function AddPaymentMethodForm({ tenantId }: AddPaymentMethodFormProps) {
  const [clientSecret, setClientSecret] = useState<string | null>(null)
  const [stripeCustomerId, setStripeCustomerId] = useState<string | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    fetch('/api/tenant/payment-methods/setup-intent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tenantId }),
    })
      .then(async (r) => {
        const data = (await r.json()) as SetupIntentResponse | { error: string }
        if (cancelled) return
        if (!r.ok || !('clientSecret' in data)) {
          setError('error' in data ? data.error : 'Failed to start payment setup')
          return
        }
        setClientSecret(data.clientSecret)
        setStripeCustomerId(data.stripeCustomerId)
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Network error')
      })
    return () => {
      cancelled = true
    }
  }, [tenantId])

  if (error) {
    return (
      <div className="p-3 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-lg flex items-center space-x-2">
        <AlertCircle className="w-4 h-4 flex-shrink-0" />
        <span>{error}</span>
      </div>
    )
  }
  if (!clientSecret || !stripeCustomerId) {
    return (
      <div className="flex items-center justify-center py-8 text-muted-foreground">
        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
        Loading secure payment form...
      </div>
    )
  }

  return (
    <Elements
      stripe={getStripe()}
      options={{
        clientSecret,
        // Load Inter so the Stripe iframe matches the app's body font.
        fonts: [
          {
            cssSrc: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap',
          },
        ],
        // Theme the hosted PaymentElement to the EZPM palette (cream/teal/ink).
        appearance: {
          theme: 'stripe',
          variables: {
            colorPrimary: '#0D7377',
            colorText: '#2A2520',
            colorTextSecondary: '#897F73',
            colorBackground: '#FFFFFF',
            colorDanger: '#B05446',
            fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
            fontSizeBase: '15px',
            borderRadius: '12px',
            spacingUnit: '4px',
          },
          rules: {
            '.Tab': {
              border: '1px solid #E8DFC9',
              boxShadow: '0 1px 2px rgba(42,37,32,0.04)',
            },
            '.Tab:hover': { color: '#0D7377' },
            '.Tab--selected': {
              borderColor: '#0D7377',
              boxShadow: '0 0 0 1px #0D7377',
              color: '#0D7377',
            },
            '.Input': {
              border: '1px solid #E8DFC9',
              boxShadow: '0 1px 2px rgba(42,37,32,0.04)',
            },
            '.Input:focus': {
              border: '1px solid #0D7377',
              boxShadow: '0 0 0 3px rgba(13,115,119,0.15)',
            },
            '.Label': { color: '#5C534A', fontWeight: '500' },
          },
        },
      }}
    >
      <PaymentElementForm stripeCustomerId={stripeCustomerId} />
    </Elements>
  )
}
