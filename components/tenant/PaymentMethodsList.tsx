'use client'

import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { PaymentMethodActions } from '@/components/tenant/PaymentMethodActions'
import { PaymentMethodDetail } from '@/components/tenant/PaymentMethodDetail'
import { getPaymentMethodIcon } from '@/utils/helpers'

interface PaymentMethod {
  id: string
  type: 'card' | 'moov_ach'
  last4: string
  is_default: boolean
  is_verified?: boolean
  moov_payment_method_id?: string
}

interface PaymentMethodsListProps {
  paymentMethods: PaymentMethod[]
  moovAccountId?: string | null
}

export function PaymentMethodsList({ paymentMethods, moovAccountId }: PaymentMethodsListProps) {
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethod | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)

  const handleMethodClick = (method: PaymentMethod) => {
    // Only open modal for unverified ACH accounts
    if (method.type === 'moov_ach' && !method.is_verified) {
      setSelectedMethod(method)
      setIsModalOpen(true)
    }
  }

  return (
    <>
      <div className="space-y-4">
        {paymentMethods.map((method) => {
          const isClickable = method.type === 'moov_ach' && !method.is_verified
          
          return (
            <div 
              key={method.id} 
              className={`
                flex flex-col sm:flex-row sm:items-center sm:justify-between 
                p-4 border rounded-lg transition-colors space-y-3 sm:space-y-0
                ${isClickable ? 'hover:bg-gray-50 cursor-pointer' : ''}
              `}
              onClick={() => handleMethodClick(method)}
            >
              <div className="flex items-center space-x-4">
                <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
                  <span className="text-xl">{getPaymentMethodIcon(method.type)}</span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-gray-900">
                    {method.type === 'card' ? 'Credit/Debit Card' : 
                     method.type === 'moov_ach' ? 'Bank Account (ACH)' : 'Unknown'}
                  </p>
                  <p className="text-sm text-gray-600">
                    ****{method.last4}
                  </p>
                  <div className="flex items-center gap-2 mt-1">
                    {method.is_default && (
                      <Badge variant="default" className="text-xs">
                        Default
                      </Badge>
                    )}
                    {method.type === 'moov_ach' && method.is_verified === false && (
                      <>
                        <Badge variant="outline" className="text-xs text-amber-600 border-amber-300">
                          Pending Verification
                        </Badge>
                        <span className="text-xs text-blue-600">
                          Click to verify →
                        </span>
                      </>
                    )}
                    {method.type === 'moov_ach' && method.is_verified === true && (
                      <Badge variant="outline" className="text-xs text-green-600 border-green-300">
                        Verified
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
              
              <div className="flex justify-end sm:justify-start" onClick={(e) => e.stopPropagation()}>
                <PaymentMethodActions paymentMethod={method} />
              </div>
            </div>
          )
        })}
      </div>

      {selectedMethod && (
        <PaymentMethodDetail
          paymentMethod={selectedMethod}
          moovAccountId={moovAccountId}
          isOpen={isModalOpen}
          onClose={() => {
            setIsModalOpen(false)
            setSelectedMethod(null)
          }}
        />
      )}
    </>
  )
}
