'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Elements, useStripe, useElements } from '@stripe/react-stripe-js'
import { getStripe } from '@/lib/stripe-client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { formatCurrency, getPaymentMethodIcon } from '@/utils/helpers'
import { CreditCard, AlertCircle, Check } from 'lucide-react'

interface Payment {
  id: string
  amount: number
  due_date: string
}

interface PaymentMethod {
  id: string
  type: 'card' | 'us_bank_account'
  last4: string
  is_default: boolean
}

interface StripePaymentFormProps {
  payment: Payment
  paymentMethods: PaymentMethod[]
  tenantId: string
}

function PaymentForm({ payment, paymentMethods, tenantId }: StripePaymentFormProps) {
  const stripe = useStripe()
  const elements = useElements()
  const router = useRouter()
  
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState(
    paymentMethods.find(pm => pm.is_default)?.id || paymentMethods[0]?.id || ''
  )
  const [isProcessing, setIsProcessing] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!selectedPaymentMethod) {
      setError('Please select a payment method')
      return
    }

    if (!stripe) {
      setError('Stripe has not loaded yet. Please try again.')
      return
    }

    setIsProcessing(true)
    setError('')

    try {
      const response = await fetch('/api/tenant/payments/process', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          paymentId: payment.id,
          paymentMethodId: selectedPaymentMethod,
          tenantId: tenantId,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Payment failed')
      }

      // Check if payment requires additional action
      if (data.requiresAction) {
        const { error: confirmError } = await stripe.confirmCardPayment(data.clientSecret)
        
        if (confirmError) {
          throw new Error(confirmError.message || 'Payment confirmation failed')
        }
        
        // Payment will be handled by webhook
        setSuccess(true)
        setTimeout(() => {
          router.push('/tenant/payment-history')
          router.refresh()
        }, 2000)
      } else if (data.success) {
        // Payment succeeded immediately
        setSuccess(true)
        setTimeout(() => {
          router.push('/tenant/payment-history')
          router.refresh()
        }, 2000)
      } else {
        throw new Error('Unexpected response from payment processor')
      }

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Payment processing failed')
    } finally {
      setIsProcessing(false)
    }
  }

  if (success) {
    return (
      <Card className="border-green-200 bg-green-50">
        <CardContent className="pt-6">
          <div className="text-center">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Check className="w-8 h-8 text-green-600" />
            </div>
            <h3 className="text-lg font-medium text-green-900 mb-2">Payment Successful!</h3>
            <p className="text-green-800 mb-4">
              Your payment of {formatCurrency(payment.amount)} has been processed successfully.
            </p>
            <p className="text-sm text-green-700">
              You'll receive an email confirmation shortly. Redirecting to payment history...
            </p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center space-x-2">
          <CreditCard className="w-5 h-5" />
          <span>Select Payment Method</span>
        </CardTitle>
        <CardDescription>
          Choose how you'd like to pay your rent
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          {error && (
            <div className="p-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="space-y-3">
            {paymentMethods.map((method) => (
              <div key={method.id} className="relative">
                <input
                  type="radio"
                  name="paymentMethod"
                  value={method.id}
                  id={method.id}
                  checked={selectedPaymentMethod === method.id}
                  onChange={(e) => setSelectedPaymentMethod(e.target.value)}
                  className="peer sr-only"
                />
                <Label
                  htmlFor={method.id}
                  className="flex items-center justify-between p-4 border-2 border-gray-200 rounded-lg cursor-pointer hover:border-gray-300 peer-checked:border-blue-500 peer-checked:bg-blue-50"
                >
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center">
                      <span className="text-lg">{getPaymentMethodIcon(method.type)}</span>
                    </div>
                    <div>
                      <p className="font-medium">
                        {method.type === 'card' ? 'Credit/Debit Card' : 'Bank Account'}
                      </p>
                      <p className="text-sm text-gray-600">
                        ****{method.last4}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    {method.is_default && (
                      <Badge variant="default" className="text-xs">
                        Default
                      </Badge>
                    )}
                    <div className={`w-4 h-4 border-2 rounded-full flex items-center justify-center ${
                      selectedPaymentMethod === method.id 
                        ? 'border-blue-500 bg-blue-500' 
                        : 'border-gray-300'
                    }`}>
                      {selectedPaymentMethod === method.id && (
                        <div className="w-2 h-2 bg-white rounded-full"></div>
                      )}
                    </div>
                  </div>
                </Label>
              </div>
            ))}
          </div>

          <div className="space-y-4">
            <div className="bg-gray-50 p-4 rounded-lg">
              <div className="flex justify-between items-center">
                <span className="font-medium">Total Amount:</span>
                <span className="text-xl font-bold">{formatCurrency(payment.amount)}</span>
              </div>
            </div>

            <Button 
              type="submit" 
              className="w-full" 
              disabled={isProcessing || !selectedPaymentMethod || !stripe}
              size="lg"
            >
              {isProcessing ? (
                <div className="flex items-center space-x-2">
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Processing Payment...</span>
                </div>
              ) : (
                `Pay ${formatCurrency(payment.amount)}`
              )}
            </Button>

            <p className="text-xs text-gray-500 text-center">
              By clicking "Pay", you agree to process this payment using your selected payment method. 
              Your payment is secured by Stripe's industry-standard encryption.
            </p>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

export function StripePaymentForm({ payment, paymentMethods, tenantId }: StripePaymentFormProps) {
  const [stripePromise, setStripePromise] = useState<Promise<any> | null>(null)

  useEffect(() => {
    setStripePromise(getStripe())
  }, [])

  if (!stripePromise) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="flex items-center space-x-2">
          <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
          <span>Loading payment processor...</span>
        </div>
      </div>
    )
  }

  return (
    <Elements stripe={stripePromise}>
      <PaymentForm payment={payment} paymentMethods={paymentMethods} tenantId={tenantId} />
    </Elements>
  )
} 