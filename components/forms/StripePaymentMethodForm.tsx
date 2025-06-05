'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Elements, CardElement, useStripe, useElements } from '@stripe/react-stripe-js'
import { getStripe } from '@/lib/stripe-client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { AlertCircle, CreditCard } from 'lucide-react'

interface StripePaymentMethodFormProps {
  tenantId: string
}

function PaymentMethodForm({ tenantId }: StripePaymentMethodFormProps) {
  const stripe = useStripe()
  const elements = useElements()
  const router = useRouter()
  
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!stripe || !elements) {
      setError('Stripe has not loaded yet. Please try again.')
      return
    }

    const cardElement = elements.getElement(CardElement)
    if (!cardElement) {
      setError('Card element not found. Please refresh the page.')
      return
    }

    setIsSubmitting(true)
    setError('')

    try {
      // Create payment method with Stripe
      const { error: stripeError, paymentMethod } = await stripe.createPaymentMethod({
        type: 'card',
        card: cardElement,
      })

      if (stripeError) {
        throw new Error(stripeError.message || 'Failed to create payment method')
      }

      if (!paymentMethod) {
        throw new Error('No payment method returned from Stripe')
      }

      // Save payment method to our database
      const response = await fetch('/api/tenant/payment-methods', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          tenantId,
          stripePaymentMethodId: paymentMethod.id,
          type: paymentMethod.type,
          last4: paymentMethod.card?.last4,
          brand: paymentMethod.card?.brand,
        }),
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Failed to save payment method')
      }

      // Success - redirect to payment methods list
      router.push('/tenant/payment-methods')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add payment method')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="p-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg flex items-center space-x-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="space-y-3">
        <Label className="text-base font-medium">Card Information</Label>
        <div className="p-4 border border-gray-300 rounded-lg bg-white">
          <CardElement 
            options={{
              style: {
                base: {
                  fontSize: '16px',
                  color: '#424770',
                  '::placeholder': {
                    color: '#aab7c4',
                  },
                },
                invalid: {
                  color: '#9e2146',
                },
              },
              hidePostalCode: false,
            }}
          />
        </div>
        <p className="text-xs text-gray-600">
          Enter your card information. Your payment details are secured by Stripe.
        </p>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex items-start space-x-3">
          <CreditCard className="w-5 h-5 text-blue-600 mt-0.5" />
          <div>
            <h4 className="font-medium text-blue-900">Secure Payment Processing</h4>
            <p className="text-sm text-blue-800 mt-1">
              Your payment information is processed securely by Stripe and encrypted using industry-standard SSL technology. 
              We never store your full payment details on our servers.
            </p>
          </div>
        </div>
      </div>

      <div className="flex space-x-4 pt-4">
        <Button 
          type="submit" 
          className="flex-1" 
          disabled={isSubmitting || !stripe}
        >
          {isSubmitting ? (
            <div className="flex items-center space-x-2">
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              <span>Adding Card...</span>
            </div>
          ) : (
            'Add Card'
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

export function StripePaymentMethodForm({ tenantId }: StripePaymentMethodFormProps) {
  const [stripePromise, setStripePromise] = useState<Promise<any> | null>(null)

  useEffect(() => {
    setStripePromise(getStripe())
  }, [])

  if (!stripePromise) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="flex items-center space-x-2">
          <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
          <span>Loading Stripe...</span>
        </div>
      </div>
    )
  }

  return (
    <Elements stripe={stripePromise}>
      <PaymentMethodForm tenantId={tenantId} />
    </Elements>
  )
} 