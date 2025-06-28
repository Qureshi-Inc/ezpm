'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { CreditCard, AlertCircle } from 'lucide-react'

interface AddPaymentMethodFormProps {
  tenantId: string
}

export function AddPaymentMethodForm({ tenantId }: AddPaymentMethodFormProps) {
  const router = useRouter()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setIsSubmitting(true)
    setError('')

    const formData = new FormData(e.currentTarget)
    
    const data = {
      tenantId,
      type: 'card',
      cardNumber: formData.get('cardNumber') as string,
      expiryMonth: formData.get('expiryMonth') as string,
      expiryYear: formData.get('expiryYear') as string,
      cvc: formData.get('cvc') as string,
      cardholderName: formData.get('cardholderName') as string,
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

      {/* Credit Card Form */}
      <div className="space-y-4">
        <div className="flex items-center space-x-2 mb-4">
          <CreditCard className="w-5 h-5 text-gray-600" />
          <h3 className="text-lg font-medium">Card Information</h3>
        </div>

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

      <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
        <div className="flex items-start space-x-2">
          <AlertCircle className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
          <div className="text-sm text-amber-800">
            <p className="font-medium">Processing Fee Notice</p>
            <p>Credit and debit card payments include a 2.9% + $0.30 processing fee that will be added to your rent payment.</p>
          </div>
        </div>
      </div>

      <div className="flex space-x-4 pt-4">
        <Button type="submit" className="flex-1" disabled={isSubmitting}>
          {isSubmitting ? (
            <div className="flex items-center space-x-2">
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              <span>Adding...</span>
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