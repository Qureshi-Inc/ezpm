'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { getPaymentMethodIcon } from '@/utils/helpers'
import { AlertCircle, Settings, CreditCard } from 'lucide-react'

interface PaymentMethod {
  id: string
  type: 'card' | 'us_bank_account'
  last4: string
  is_default: boolean
}

interface ExistingAutoPayment {
  id: string
  payment_method_id: string
  day_of_month: number
  is_active: boolean
  payment_method?: {
    id: string
    type: string
    last4: string
  }
}

interface AutoPaySetupFormProps {
  tenantId: string
  paymentMethods: PaymentMethod[]
  existingAutoPayment?: ExistingAutoPayment | null
  paymentDueDay: number
}

export function AutoPaySetupForm({ tenantId, paymentMethods, existingAutoPayment, paymentDueDay }: AutoPaySetupFormProps) {
  const router = useRouter()
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState(
    existingAutoPayment?.payment_method_id || paymentMethods.find(pm => pm.is_default)?.id || paymentMethods[0]?.id || ''
  )
  const [selectedDay, setSelectedDay] = useState(
    existingAutoPayment?.day_of_month?.toString() || paymentDueDay.toString()
  )
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!selectedPaymentMethod) {
      setError('Please select a payment method')
      return
    }

    if (!selectedDay) {
      setError('Please select a day of the month')
      return
    }

    setIsSubmitting(true)
    setError('')

    try {
      const response = await fetch('/api/tenant/auto-pay', {
        method: existingAutoPayment ? 'PUT' : 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          tenantId,
          paymentMethodId: selectedPaymentMethod,
          dayOfMonth: parseInt(selectedDay),
        }),
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Failed to set up auto pay')
      }

      // Success - redirect back to payment methods
      router.push('/tenant/payment-methods?message=auto_pay_setup_success')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to set up auto pay')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDisable = async () => {
    if (!existingAutoPayment) return

    setIsSubmitting(true)
    setError('')

    try {
      const response = await fetch('/api/tenant/auto-pay', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          tenantId,
        }),
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Failed to disable auto pay')
      }

      // Success - redirect back to payment methods
      router.push('/tenant/payment-methods?message=auto_pay_disabled')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to disable auto pay')
    } finally {
      setIsSubmitting(false)
    }
  }

  // Generate day options (1-31)
  const dayOptions = Array.from({ length: 31 }, (_, i) => i + 1)

  return (
    <div className="space-y-4 sm:space-y-6">
      {error && (
        <div className="p-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg flex items-center space-x-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Auto Pay Configuration */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Settings className="w-5 h-5" />
            <span>Auto Pay Configuration</span>
          </CardTitle>
          <CardDescription>
            Choose how you want your rent to be paid automatically each month
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Payment Method Selection */}
            <div className="space-y-3">
              <Label className="text-base font-medium">Payment Method</Label>
              <div className="space-y-2">
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
                      disabled={isSubmitting}
                    />
                    <Label
                      htmlFor={method.id}
                      className="flex items-center justify-between p-4 border-2 border-gray-200 rounded-lg cursor-pointer hover:border-gray-300 peer-checked:border-blue-500 peer-checked:bg-blue-50 transition-colors"
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
            </div>

            {/* Day of Month Selection */}
            <div className="space-y-2">
              <Label className="text-base font-medium">Payment Day</Label>
              <Select 
                value={selectedDay} 
                onValueChange={setSelectedDay}
                disabled={isSubmitting}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select day of month" />
                </SelectTrigger>
                <SelectContent>
                  {dayOptions.map((day) => (
                    <SelectItem key={day} value={day.toString()}>
                      {day === 1 ? '1st' : day === 2 ? '2nd' : day === 3 ? '3rd' : `${day}th`} of each month
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-sm text-gray-600">
                Your current rent due date is the {paymentDueDay === 1 ? '1st' : paymentDueDay === 2 ? '2nd' : paymentDueDay === 3 ? '3rd' : `${paymentDueDay}th`} of each month.
              </p>
            </div>

            {/* Info Box */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="flex items-start space-x-3">
                <AlertCircle className="w-5 h-5 text-blue-600 mt-0.5" />
                <div>
                  <h4 className="font-medium text-blue-900">How Auto Pay Works</h4>
                  <ul className="text-sm text-blue-800 mt-2 space-y-1">
                    <li>• Payments are processed automatically on your selected day each month</li>
                    <li>• Auto pay will be skipped if you've already paid manually for that month</li>
                    <li>• You'll receive email notifications for all automatic payments</li>
                    <li>• You can modify or disable auto pay at any time</li>
                  </ul>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row gap-3 pt-4">
              <Button 
                type="submit" 
                className="flex-1" 
                disabled={isSubmitting || !selectedPaymentMethod}
              >
                {isSubmitting ? (
                  <div className="flex items-center space-x-2">
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>{existingAutoPayment ? 'Updating...' : 'Setting up...'}</span>
                  </div>
                ) : (
                  existingAutoPayment ? 'Update Auto Pay' : 'Enable Auto Pay'
                )}
              </Button>

              {existingAutoPayment && (
                <Button 
                  type="button" 
                  variant="outline"
                  onClick={handleDisable}
                  disabled={isSubmitting}
                  className="flex-1 sm:flex-none"
                >
                  {isSubmitting ? 'Processing...' : 'Disable Auto Pay'}
                </Button>
              )}
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
} 