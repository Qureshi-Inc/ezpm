'use client'

/**
 * VerifyMicrodepositsForm — tenant enters the two microdeposit amounts
 * Stripe sent to their bank account. Submits to
 * /api/tenant/payment-methods/[id]/verify-microdeposits.
 *
 * Test mode hint: Stripe's documented test amounts are 32 and 45 cents,
 * which always succeed. Real-mode amounts are the actual cents Stripe
 * deposited (visible in the tenant's bank transaction history, prefixed
 * with "ACCTVERIFY" or similar).
 */

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { AlertCircle, Check, Info } from 'lucide-react'

interface VerifyMicrodepositsFormProps {
  paymentMethodId: string
  last4: string | null
}

export function VerifyMicrodepositsForm({ paymentMethodId, last4 }: VerifyMicrodepositsFormProps) {
  const router = useRouter()
  const [amount1, setAmount1] = useState('')
  const [amount2, setAmount2] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    const a = parseInt(amount1, 10)
    const b = parseInt(amount2, 10)
    if (!Number.isInteger(a) || !Number.isInteger(b) || a < 1 || b < 1 || a > 99 || b > 99) {
      setError('Enter each deposit as a whole number of cents between 1 and 99.')
      return
    }
    setIsSubmitting(true)
    try {
      const res = await fetch(`/api/tenant/payment-methods/${paymentMethodId}/verify-microdeposits`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amounts: [a, b] }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Verification failed')
        if (data.attemptsExhausted) {
          setError(`${data.error} You'll need to remove this bank account and add it again.`)
        }
        setIsSubmitting(false)
        return
      }
      setSuccess(true)
      setTimeout(() => {
        router.push('/tenant/payment-methods')
        router.refresh()
      }, 1500)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error')
      setIsSubmitting(false)
    }
  }

  if (success) {
    return (
      <div className="space-y-3 p-6 bg-green-50 border border-green-200 rounded-lg text-center">
        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
          <Check className="w-8 h-8 text-green-600" />
        </div>
        <h3 className="font-medium text-green-900">Bank verified</h3>
        <p className="text-sm text-green-800">
          Your bank account ending in {last4 ?? '••••'} is now active. Redirecting...
        </p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="p-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg flex items-start space-x-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-900 flex items-start space-x-2">
        <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
        <div>
          <p className="font-medium mb-1">Where to find the deposits</p>
          <p>
            Check the transaction history of your bank account ending in <b>{last4 ?? '••••'}</b>.
            Look for two small deposits (each under $1) from <b>STRIPE</b> or <b>ACCTVERIFY</b>.
            Enter the cent amounts below.
          </p>
          <p className="mt-2 text-xs text-blue-800">
            Test mode: use 32 and 45.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="amount1">First deposit (cents)</Label>
          <Input
            id="amount1"
            type="number"
            min="1"
            max="99"
            placeholder="32"
            value={amount1}
            onChange={(e) => setAmount1(e.target.value)}
            disabled={isSubmitting}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="amount2">Second deposit (cents)</Label>
          <Input
            id="amount2"
            type="number"
            min="1"
            max="99"
            placeholder="45"
            value={amount2}
            onChange={(e) => setAmount2(e.target.value)}
            disabled={isSubmitting}
            required
          />
        </div>
      </div>

      <div className="flex space-x-3">
        <Button type="submit" className="flex-1" disabled={isSubmitting}>
          {isSubmitting ? 'Verifying...' : 'Verify Bank Account'}
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

      <p className="text-xs text-gray-500">
        Order doesn&apos;t matter. You have up to 10 attempts before the bank account is rejected.
      </p>
    </form>
  )
}
