'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { AlertCircle, Building2 } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'

interface MoovPaymentMethodFormProps {
  tenantId: string
}

export function MoovPaymentMethodForm({ tenantId }: MoovPaymentMethodFormProps) {
  const router = useRouter()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  const [formData, setFormData] = useState({
    accountHolderName: '',
    routingNumber: '',
    accountNumber: '',
    accountType: 'checking' as 'checking' | 'savings'
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    setError(null)

    const { accountHolderName, routingNumber, accountNumber, accountType } = formData

    if (!accountHolderName || !routingNumber || !accountNumber) {
      setError('Please fill in all required fields')
      setIsSubmitting(false)
      return
    }

    try {
      // Create the payment method directly with server-side bank account creation
      const response = await fetch('/api/tenant/payment-methods/moov', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          tenantId,
          accountHolderName,
          routingNumber,
          accountNumber,
          accountType
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to create payment method')
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

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="space-y-4">
        <div>
          <Label htmlFor="accountHolderName">Account Holder Name *</Label>
          <Input
            id="accountHolderName"
            type="text"
            value={formData.accountHolderName}
            onChange={(e) => handleInputChange('accountHolderName', e.target.value)}
            placeholder="Enter the name on the bank account"
            required
          />
        </div>

        <div>
          <Label htmlFor="routingNumber">Routing Number *</Label>
          <Input
            id="routingNumber"
            type="text"
            value={formData.routingNumber}
            onChange={(e) => handleInputChange('routingNumber', e.target.value)}
            placeholder="Enter 9-digit routing number"
            pattern="[0-9]{9}"
            maxLength={9}
            required
          />
          <p className="text-xs text-gray-500 mt-1">
            This is the 9-digit number on the bottom of your checks
          </p>
        </div>

        <div>
          <Label htmlFor="accountNumber">Account Number *</Label>
          <Input
            id="accountNumber"
            type="text"
            value={formData.accountNumber}
            onChange={(e) => handleInputChange('accountNumber', e.target.value)}
            placeholder="Enter your account number"
            required
          />
        </div>

        <div>
          <Label htmlFor="accountType">Account Type *</Label>
          <Select 
            value={formData.accountType} 
            onValueChange={(value: 'checking' | 'savings') => handleInputChange('accountType', value)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select account type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="checking">Checking</SelectItem>
              <SelectItem value="savings">Savings</SelectItem>
            </SelectContent>
          </Select>
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