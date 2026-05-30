'use client'

import { Badge } from '@/components/ui/badge'
import { PaymentMethodActions } from '@/components/tenant/PaymentMethodActions'
import { getPaymentMethodIcon } from '@/utils/helpers'
import type { PaymentMethodType } from '@/utils/payment-fees'

interface PaymentMethod {
  id: string
  type: PaymentMethodType
  last4: string | null
  bank_name?: string | null
  card_brand?: string | null
  is_default: boolean
}

interface PaymentMethodsListProps {
  paymentMethods: PaymentMethod[]
}

function describe(method: PaymentMethod): string {
  if (method.type === 'card') {
    return method.card_brand
      ? `${method.card_brand.toUpperCase()} card`
      : 'Credit/Debit Card'
  }
  return method.bank_name || 'Bank Account (ACH)'
}

export function PaymentMethodsList({ paymentMethods }: PaymentMethodsListProps) {
  return (
    <div className="space-y-4">
      {paymentMethods.map((method) => (
        <div
          key={method.id}
          className="flex flex-col sm:flex-row sm:items-center sm:justify-between p-4 border rounded-lg space-y-3 sm:space-y-0"
        >
          <div className="flex items-center space-x-4">
            <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
              <span className="text-xl">{getPaymentMethodIcon(method.type)}</span>
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-medium text-gray-900">{describe(method)}</p>
              <p className="text-sm text-gray-600">****{method.last4 ?? '••••'}</p>
              <div className="flex items-center gap-2 mt-1">
                {method.is_default && (
                  <Badge variant="default" className="text-xs">
                    Default
                  </Badge>
                )}
              </div>
            </div>
          </div>

          <div className="flex justify-end sm:justify-start">
            <PaymentMethodActions paymentMethod={method} />
          </div>
        </div>
      ))}
    </div>
  )
}
