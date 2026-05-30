'use client'

/**
 * RentPaymentForm — consolidated payment-method picker + Pay Now button
 * for an open Stripe Invoice.
 *
 * Replaces the old PaymentForm.tsx (Moov+Stripe selector with raw radios)
 * and StripePaymentForm.tsx (Stripe Elements wrapper that ALSO had a
 * picker). One form to rule them all, post-migration:
 *   - lists the tenant's saved payment methods (card + us_bank_account)
 *   - lets them pick one
 *   - POSTs to /api/tenant/payments/process which calls stripe.invoices.pay
 *
 * No "add new method here" affordance — adding lives at
 * /tenant/payment-methods/add, which is its own SetupIntent flow.
 */

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { formatCurrency, getPaymentMethodIcon } from '@/utils/helpers'
import { calculateProcessingFee } from '@/utils/payment-fees'
import { CreditCard, AlertCircle, Check } from 'lucide-react'
import type { PaymentMethodType } from '@/utils/payment-fees'

interface Payment {
  id: string
  amount: number
  due_date: string
  stripe_invoice_id: string | null
}

interface PaymentMethod {
  id: string
  type: PaymentMethodType
  last4: string | null
  bank_name?: string | null
  card_brand?: string | null
  is_default: boolean
}

interface RentPaymentFormProps {
  payment: Payment
  paymentMethods: PaymentMethod[]
}

export function RentPaymentForm({ payment, paymentMethods }: RentPaymentFormProps) {
  const router = useRouter()
  const [selectedPmId, setSelectedPmId] = useState(
    paymentMethods.find((pm) => pm.is_default)?.id || paymentMethods[0]?.id || '',
  )
  const [isProcessing, setIsProcessing] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  const selectedPm = paymentMethods.find((pm) => pm.id === selectedPmId)
  const fee = selectedPm ? calculateProcessingFee(payment.amount, selectedPm.type) : null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedPmId) {
      setError('Pick a payment method')
      return
    }
    setIsProcessing(true)
    setError('')

    try {
      const response = await fetch('/api/tenant/payments/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          paymentId: payment.id,
          paymentMethodId: selectedPmId,
        }),
      })
      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.error || 'Payment failed')
      }
      setSuccess(true)
      setTimeout(() => {
        router.push('/tenant/payment-history')
        router.refresh()
      }, 1500)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Payment processing failed')
      setIsProcessing(false)
    }
  }

  if (success) {
    return (
      <Card className="border-green-200 bg-green-50">
        <CardContent className="pt-6 text-center space-y-3">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
            <Check className="w-8 h-8 text-green-600" />
          </div>
          <h3 className="text-lg font-medium text-green-900">Payment submitted</h3>
          <p className="text-sm text-green-800">
            {fee && fee.totalWithFee
              ? `${formatCurrency(fee.totalWithFee)} processed.`
              : `${formatCurrency(payment.amount)} processed.`}{' '}
            Bank payments take a few business days to settle. Redirecting to history...
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center space-x-2">
          <CreditCard className="w-5 h-5" />
          <span>Pay this invoice</span>
        </CardTitle>
        <CardDescription>Pick which saved payment method to charge.</CardDescription>
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
                  id={`pm-${method.id}`}
                  checked={selectedPmId === method.id}
                  onChange={(e) => setSelectedPmId(e.target.value)}
                  className="peer sr-only"
                />
                <Label
                  htmlFor={`pm-${method.id}`}
                  className="flex items-center justify-between p-4 border-2 border-gray-200 rounded-lg cursor-pointer hover:border-gray-300 peer-checked:border-blue-500 peer-checked:bg-blue-50"
                >
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center">
                      <span className="text-lg">{getPaymentMethodIcon(method.type)}</span>
                    </div>
                    <div>
                      <p className="font-medium">
                        {method.type === 'card'
                          ? method.card_brand
                            ? `${method.card_brand.toUpperCase()} card`
                            : 'Credit/Debit Card'
                          : method.bank_name || 'Bank account (ACH)'}
                      </p>
                      <p className="text-sm text-gray-600">****{method.last4 ?? '••••'}</p>
                      <p className="text-xs text-gray-500 mt-1">
                        {method.type === 'card' ? '2.9% + $0.30 fee' : '0.8% capped at $5'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    {method.is_default && (
                      <Badge variant="default" className="text-xs">
                        Default
                      </Badge>
                    )}
                    <div
                      className={`w-4 h-4 border-2 rounded-full flex items-center justify-center ${
                        selectedPmId === method.id ? 'border-blue-500 bg-blue-500' : 'border-gray-300'
                      }`}
                    >
                      {selectedPmId === method.id && <div className="w-2 h-2 bg-white rounded-full" />}
                    </div>
                  </div>
                </Label>
              </div>
            ))}
          </div>

          <div className="bg-gray-50 p-4 rounded-lg space-y-2">
            <div className="flex justify-between items-center text-sm">
              <span className="text-gray-600">Rent amount:</span>
              <span className="font-medium">{formatCurrency(payment.amount)}</span>
            </div>
            {fee && (
              <>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-gray-600">Processing fee:</span>
                  <span className="font-medium">{formatCurrency(fee.amount)}</span>
                </div>
                <div className="border-t pt-2 flex justify-between items-center">
                  <span className="font-medium">Total:</span>
                  <span className="text-xl font-bold">{formatCurrency(fee.totalWithFee)}</span>
                </div>
              </>
            )}
          </div>

          <Button
            type="submit"
            className="w-full"
            disabled={isProcessing || !selectedPmId}
            size="lg"
          >
            {isProcessing
              ? 'Processing...'
              : `Pay ${formatCurrency(fee ? fee.totalWithFee : payment.amount)}`}
          </Button>

          <p className="text-xs text-gray-500 text-center">
            Bank account (ACH) payments settle in about 4 business days. Card payments are instant.
          </p>
        </form>
      </CardContent>
    </Card>
  )
}
