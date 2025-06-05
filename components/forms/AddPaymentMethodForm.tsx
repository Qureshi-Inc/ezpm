'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { CreditCard, Building2, AlertCircle } from 'lucide-react'

interface AddPaymentMethodFormProps {
  tenantId: string
}

export function AddPaymentMethodForm({ tenantId }: AddPaymentMethodFormProps) {
  const router = useRouter()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [paymentType, setPaymentType] = useState('card')

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setIsSubmitting(true)
    setError('')

    const formData = new FormData(e.currentTarget)
    
    let data: any = {
      tenantId,
      type: paymentType,
    }

    if (paymentType === 'card') {
      data = {
        ...data,
        cardNumber: formData.get('cardNumber') as string,
        expiryMonth: formData.get('expiryMonth') as string,
        expiryYear: formData.get('expiryYear') as string,
        cvc: formData.get('cvc') as string,
        cardholderName: formData.get('cardholderName') as string,
      }
    } else {
      data = {
        ...data,
        accountNumber: formData.get('accountNumber') as string,
        routingNumber: formData.get('routingNumber') as string,
        accountHolderName: formData.get('accountHolderName') as string,
        accountType: formData.get('accountType') as string,
      }
    }

    try {
      const response = await fetch('/api/tenant/payment-methods', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Failed to add payment method')
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

      {/* Payment Type Selection */}
      <div className="space-y-3">
        <Label className="text-base font-medium">Payment Method Type</Label>
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => setPaymentType('card')}
            className={`p-4 border-2 rounded-lg flex items-center space-x-3 transition-colors ${
              paymentType === 'card' 
                ? 'border-blue-500 bg-blue-50' 
                : 'border-gray-200 hover:border-gray-300'
            }`}
          >
            <CreditCard className="w-5 h-5 text-gray-600" />
            <div className="text-left">
              <p className="font-medium">Credit/Debit Card</p>
              <p className="text-sm text-gray-600">Visa, Mastercard, Amex</p>
            </div>
          </button>
          
          <button
            type="button"
            onClick={() => setPaymentType('us_bank_account')}
            className={`p-4 border-2 rounded-lg flex items-center space-x-3 transition-colors ${
              paymentType === 'us_bank_account' 
                ? 'border-blue-500 bg-blue-50' 
                : 'border-gray-200 hover:border-gray-300'
            }`}
          >
            <Building2 className="w-5 h-5 text-gray-600" />
            <div className="text-left">
              <p className="font-medium">Bank Account</p>
              <p className="text-sm text-gray-600">ACH transfer</p>
            </div>
          </button>
        </div>
      </div>

      {/* Credit Card Form */}
      {paymentType === 'card' && (
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="cardholderName">Cardholder Name *</Label>
            <Input 
              id="cardholderName" 
              name="cardholderName"
              placeholder="John Doe"
              required 
              disabled={isSubmitting}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="cardNumber">Card Number *</Label>
            <Input 
              id="cardNumber" 
              name="cardNumber"
              placeholder="1234 5678 9012 3456"
              maxLength={19}
              required 
              disabled={isSubmitting}
              onChange={(e) => {
                // Format card number with spaces
                const value = e.target.value.replace(/\D/g, '').replace(/(.{4})/g, '$1 ').trim()
                e.target.value = value
              }}
            />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="expiryMonth">Month *</Label>
              <Select name="expiryMonth" required disabled={isSubmitting}>
                <SelectTrigger>
                  <SelectValue placeholder="MM" />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 12 }, (_, i) => i + 1).map(month => (
                    <SelectItem key={month} value={month.toString().padStart(2, '0')}>
                      {month.toString().padStart(2, '0')}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="expiryYear">Year *</Label>
              <Select name="expiryYear" required disabled={isSubmitting}>
                <SelectTrigger>
                  <SelectValue placeholder="YYYY" />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 10 }, (_, i) => new Date().getFullYear() + i).map(year => (
                    <SelectItem key={year} value={year.toString()}>
                      {year}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="cvc">CVC *</Label>
              <Input 
                id="cvc" 
                name="cvc"
                placeholder="123"
                maxLength={4}
                required 
                disabled={isSubmitting}
                onChange={(e) => {
                  // Only allow numbers
                  e.target.value = e.target.value.replace(/\D/g, '')
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Bank Account Form */}
      {paymentType === 'us_bank_account' && (
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="accountHolderName">Account Holder Name *</Label>
            <Input 
              id="accountHolderName" 
              name="accountHolderName"
              placeholder="John Doe"
              required 
              disabled={isSubmitting}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="accountType">Account Type *</Label>
            <Select name="accountType" required disabled={isSubmitting}>
              <SelectTrigger>
                <SelectValue placeholder="Select account type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="checking">Checking</SelectItem>
                <SelectItem value="savings">Savings</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="routingNumber">Routing Number *</Label>
              <Input 
                id="routingNumber" 
                name="routingNumber"
                placeholder="123456789"
                maxLength={9}
                required 
                disabled={isSubmitting}
                onChange={(e) => {
                  // Only allow numbers
                  e.target.value = e.target.value.replace(/\D/g, '')
                }}
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="accountNumber">Account Number *</Label>
              <Input 
                id="accountNumber" 
                name="accountNumber"
                placeholder="1234567890"
                required 
                disabled={isSubmitting}
                onChange={(e) => {
                  // Only allow numbers
                  e.target.value = e.target.value.replace(/\D/g, '')
                }}
              />
            </div>
          </div>

          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
            <div className="flex items-start space-x-2">
              <AlertCircle className="w-4 h-4 text-yellow-600 mt-0.5 flex-shrink-0" />
              <div className="text-sm text-yellow-800">
                <p className="font-medium">Bank Account Verification</p>
                <p>We'll send small test deposits to verify your account. This process usually takes 1-2 business days.</p>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="flex space-x-4 pt-4">
        <Button type="submit" className="flex-1" disabled={isSubmitting}>
          {isSubmitting ? (
            <div className="flex items-center space-x-2">
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              <span>Adding...</span>
            </div>
          ) : (
            `Add ${paymentType === 'card' ? 'Card' : 'Bank Account'}`
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