'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { AlertCircle, CheckCircle, CreditCard, Building } from 'lucide-react'
import Link from 'next/link'

interface PaymentMethod {
  id: string
  type: 'card' | 'moov_ach'
  last4: string
  is_default: boolean
  is_verified?: boolean
  moov_payment_method_id?: string
}

interface PaymentMethodDetailProps {
  paymentMethod: PaymentMethod
  moovAccountId?: string | null
  isOpen: boolean
  onClose: () => void
}

export function PaymentMethodDetail({ 
  paymentMethod, 
  moovAccountId,
  isOpen, 
  onClose 
}: PaymentMethodDetailProps) {
  const router = useRouter()

  if (!isOpen) return null

  const isACH = paymentMethod.type === 'moov_ach'
  const needsVerification = isACH && !paymentMethod.is_verified

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <Card className="max-w-md w-full">
        <CardHeader>
          <div className="flex items-start justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
                {isACH ? (
                  <Building className="w-6 h-6 text-blue-600" />
                ) : (
                  <CreditCard className="w-6 h-6 text-blue-600" />
                )}
              </div>
              <div>
                <CardTitle>
                  {isACH ? 'Bank Account' : 'Credit/Debit Card'}
                </CardTitle>
                <CardDescription>****{paymentMethod.last4}</CardDescription>
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600"
            >
              ✕
            </button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Status Section */}
          <div className="space-y-2">
            <p className="text-sm font-medium text-gray-700">Status</p>
            <div className="flex items-center space-x-2">
              {isACH ? (
                paymentMethod.is_verified ? (
                  <>
                    <CheckCircle className="w-5 h-5 text-green-600" />
                    <Badge variant="outline" className="text-green-600 border-green-300">
                      Verified
                    </Badge>
                  </>
                ) : (
                  <>
                    <AlertCircle className="w-5 h-5 text-amber-600" />
                    <Badge variant="outline" className="text-amber-600 border-amber-300">
                      Pending Verification
                    </Badge>
                  </>
                )
              ) : (
                <>
                  <CheckCircle className="w-5 h-5 text-green-600" />
                  <Badge variant="outline" className="text-green-600 border-green-300">
                    Active
                  </Badge>
                </>
              )}
            </div>
          </div>

          {/* Verification Section for ACH */}
          {needsVerification && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 space-y-3">
              <div className="flex items-start space-x-2">
                <AlertCircle className="w-5 h-5 text-amber-600 mt-0.5" />
                <div className="space-y-1">
                  <p className="text-sm font-medium text-amber-900">
                    Verification Required
                  </p>
                  <p className="text-sm text-amber-700">
                    To use this bank account for payments, you need to verify it with micro-deposits.
                  </p>
                </div>
              </div>
              
              <div className="space-y-2">
                <p className="text-sm text-amber-700">
                  We've sent two small deposits to your bank account. Check your bank statement and verify the amounts.
                </p>
                
                <Link 
                  href={`/tenant/payment-methods/verify-micro-deposits?bankAccountId=${paymentMethod.moov_payment_method_id}&accountId=${moovAccountId || ''}&last4=${paymentMethod.last4}`}
                >
                  <Button className="w-full">
                    Verify Now
                  </Button>
                </Link>
              </div>
            </div>
          )}

          {/* Info Section */}
          <div className="space-y-2">
            <p className="text-sm font-medium text-gray-700">Payment Method Details</p>
            <div className="space-y-1 text-sm text-gray-600">
              <p>Type: {isACH ? 'ACH Bank Transfer' : 'Card Payment'}</p>
              <p>Last 4 digits: {paymentMethod.last4}</p>
              {paymentMethod.is_default && (
                <p className="text-blue-600 font-medium">Default payment method</p>
              )}
            </div>
          </div>

          {/* Processing Fees */}
          <div className="bg-gray-50 rounded-lg p-3">
            <p className="text-sm font-medium text-gray-700 mb-1">Processing Fees</p>
            <p className="text-sm text-gray-600">
              {isACH ? (
                <span className="text-green-600 font-medium">No fees - Direct bank transfer</span>
              ) : (
                <span>2.9% + $0.30 per transaction</span>
              )}
            </p>
          </div>

          {/* Actions */}
          <div className="flex space-x-3">
            <Button 
              variant="outline" 
              onClick={onClose}
              className="flex-1"
            >
              Close
            </Button>
            {!needsVerification && (
              <Button 
                onClick={() => {
                  onClose()
                  router.push('/tenant/pay')
                }}
                className="flex-1"
              >
                Make Payment
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
