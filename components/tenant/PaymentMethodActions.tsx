'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { DeleteConfirmationDialog } from '@/components/ui/delete-confirmation-dialog'
import { Edit, Trash2 } from 'lucide-react'

interface PaymentMethod {
  id: string
  type: 'card' | 'us_bank_account'
  last4: string
  is_default: boolean
}

interface PaymentMethodActionsProps {
  paymentMethod: PaymentMethod
}

export function PaymentMethodActions({ paymentMethod }: PaymentMethodActionsProps) {
  const router = useRouter()
  const [isDeleting, setIsDeleting] = useState(false)
  const [error, setError] = useState('')

  const handleDelete = async () => {
    setIsDeleting(true)
    setError('')

    try {
      const response = await fetch(`/api/tenant/payment-methods/${paymentMethod.id}`, {
        method: 'DELETE',
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to delete payment method')
      }

      // Success - refresh the page
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete payment method')
      throw err // Re-throw to let the dialog handle the error state
    } finally {
      setIsDeleting(false)
    }
  }

  const methodName = paymentMethod.type === 'card' 
    ? `Card ending in ${paymentMethod.last4}` 
    : `Bank account ending in ${paymentMethod.last4}`

  return (
    <div className="flex items-center space-x-2">
      {error && (
        <div className="fixed top-4 right-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm z-50">
          {error}
        </div>
      )}
      
      <Button variant="outline" size="sm" disabled>
        <Edit className="w-4 h-4 mr-1" />
        Edit
      </Button>
      
      <DeleteConfirmationDialog
        title="Remove Payment Method"
        description="This will permanently remove this payment method from your account."
        itemName={methodName}
        onConfirm={handleDelete}
        isLoading={isDeleting}
        destructiveWarning={paymentMethod.is_default ? "This is your default payment method. Another method will be set as default if available." : undefined}
        trigger={
          <Button 
            variant="outline" 
            size="sm" 
            className="text-red-600 hover:text-red-700"
            disabled={isDeleting}
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        }
      />
    </div>
  )
} 