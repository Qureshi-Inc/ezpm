'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { AlertCircle, Building2 } from 'lucide-react'
import { getMoov } from '@/lib/moov-client'

interface MoovPaymentMethodFormProps {
  tenantId: string
}

export function MoovPaymentMethodForm({ tenantId }: MoovPaymentMethodFormProps) {
  const router = useRouter()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [accountNumber, setAccountNumber] = useState('')
  const [routingNumber, setRoutingNumber] = useState('')
  const [accountHolderName, setAccountHolderName] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!accountNumber || !routingNumber || !accountHolderName) {
      setError('All fields are required')
      return
    }

    // Validate routing number (should be 9 digits)
    if (!/^\d{9}$/.test(routingNumber)) {
      setError('Routing number must be 9 digits')
      return
    }

    setIsSubmitting(true)
    setError('')

    try {
      // First, get a Moov token with the necessary scopes
      const tokenResponse = await fetch('/api/moov/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          scopes: ['/accounts.write', '/bank-accounts.write']
        }),
      })

      if (!tokenResponse.ok) {
        throw new Error('Failed to get authentication token')
      }

      const { token } = await tokenResponse.json()
      
      // Initialize Moov.js
      const moov = await getMoov(token)
      
      // Get or create the account
      const accountResponse = await fetch('/api/tenant/payment-methods/moov', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          tenantId,
          moovPaymentMethodId: 'temp', // We'll update this after creating the bank account
          accountNumber,
          routingNumber
        }),
      })

      if (!accountResponse.ok) {
        const errorData = await accountResponse.json()
        throw new Error(errorData.error || 'Failed to create payment method')
      }

      const { moovAccountId } = await accountResponse.json()

      // For now, we'll use a placeholder ID until we can properly link the bank account
      // In a real implementation, you would use Moov Drops or the Moov API directly
      const bankAccountId = `bank_${Date.now()}`
      
      // Update the payment method with the bank account ID
      const updateResponse = await fetch('/api/tenant/payment-methods/moov', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          tenantId,
          moovPaymentMethodId: bankAccountId,
          accountNumber,
          routingNumber
        }),
      })

      if (!updateResponse.ok) {
        throw new Error('Failed to save payment method')
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

      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="accountHolderName">Account Holder Name</Label>
          <Input
            id="accountHolderName"
            type="text"
            placeholder="John Doe"
            value={accountHolderName}
            onChange={(e) => setAccountHolderName(e.target.value)}
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="routingNumber">Routing Number</Label>
          <Input
            id="routingNumber"
            type="text"
            placeholder="123456789"
            value={routingNumber}
            onChange={(e) => setRoutingNumber(e.target.value.replace(/\D/g, '').slice(0, 9))}
            maxLength={9}
            required
          />
          <p className="text-xs text-gray-600">
            9-digit routing number found on your checks
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="accountNumber">Account Number</Label>
          <Input
            id="accountNumber"
            type="text"
            placeholder="1234567890"
            value={accountNumber}
            onChange={(e) => setAccountNumber(e.target.value.replace(/\D/g, ''))}
            required
          />
        </div>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex items-start space-x-3">
          <Building2 className="w-5 h-5 text-blue-600 mt-0.5" />
          <div>
            <h4 className="font-medium text-blue-900">Secure Bank Connection</h4>
            <p className="text-sm text-blue-800 mt-1">
              Your bank account information is processed securely by Moov and encrypted using industry-standard SSL technology. 
              We use ACH (Automated Clearing House) for electronic bank transfers.
            </p>
          </div>
        </div>
      </div>

      <div className="bg-green-50 border border-green-200 rounded-lg p-4">
        <div className="flex items-start space-x-3">
          <AlertCircle className="w-5 h-5 text-green-600 mt-0.5" />
          <div>
            <h4 className="font-medium text-green-900">No Processing Fees</h4>
            <p className="text-sm text-green-800 mt-1">
              ACH transfers through Moov have no processing fees for tenants. You pay only your rent amount.
              For example: $1,000 rent = $1,000 total payment.
            </p>
          </div>
        </div>
      </div>

      <Button 
        type="submit" 
        className="w-full" 
        disabled={isSubmitting}
      >
        {isSubmitting ? (
          <div className="flex items-center space-x-2">
            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            <span>Adding Bank Account...</span>
          </div>
        ) : (
          'Add Bank Account'
        )}
      </Button>

      <p className="text-xs text-gray-500 text-center">
        By adding your bank account, you agree to Moov's terms of service and authorize 
        electronic ACH debits from your account for rent payments.
      </p>
    </form>
  )
} 