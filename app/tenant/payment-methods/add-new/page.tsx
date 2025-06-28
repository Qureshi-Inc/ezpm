'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { AlertCircle, CreditCard, Building2, Check, ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

export default function AddPaymentMethodPage() {
  const router = useRouter()

  const paymentOptions = [
    {
      id: 'stripe',
      title: 'Credit/Debit Card',
      provider: 'Powered by Stripe',
      icon: CreditCard,
      fees: [
        { type: 'Credit/Debit Cards', fee: '2.9% + $0.30', example: '$1,029.30 on $1,000' }
      ],
      benefits: [
        'Instant processing',
        'Wide acceptance',
        'All major cards supported'
      ],
      action: () => router.push('/tenant/payment-methods/add'),
      buttonText: 'Add Credit/Debit Card',
      buttonVariant: 'default' as const
    },
    {
      id: 'moov',
      title: 'Bank Account (ACH)',
      provider: 'Powered by Moov',
      icon: Building2,
      fees: [
        { type: 'ACH Transfer', fee: 'No fees!', example: '$1,000.00 on $1,000', noFee: true }
      ],
      benefits: [
        'No processing fees',
        'Direct bank transfer',
        'Processes in 1-3 days'
      ],
      action: () => router.push('/tenant/payment-methods/add-moov'),
      buttonText: 'Add Bank Account (No Fees)',
      buttonVariant: 'default' as const,
      recommended: true
    }
  ]

  return (
    <div className="container max-w-4xl mx-auto p-4 sm:p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl sm:text-3xl font-bold">Choose Payment Method</h1>
        <Link href="/tenant/payment-methods">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
        </Link>
      </div>

      <Card className="border-amber-200 bg-amber-50">
        <CardContent className="pt-6">
          <div className="flex items-start space-x-3">
            <AlertCircle className="w-5 h-5 text-amber-600 mt-0.5" />
            <div>
              <h3 className="font-medium text-amber-900">Processing Fees</h3>
              <p className="text-sm text-amber-800 mt-1">
                Different payment methods have different processing fees. Choose the option that works best for you.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        {paymentOptions.map((option) => {
          const Icon = option.icon
          
          return (
            <Card 
              key={option.id} 
              className={option.recommended ? 'border-green-300 relative' : ''}
            >
              {option.recommended && (
                <div className="absolute -top-3 left-4 px-3 py-1 bg-green-600 text-white text-xs font-medium rounded-full">
                  Recommended - No Fees!
                </div>
              )}
              
              <CardHeader>
                <div className="flex items-start justify-between">
                  <Icon className="w-8 h-8 text-gray-600" />
                </div>
                <CardTitle className="text-xl">{option.title}</CardTitle>
                <CardDescription>{option.provider}</CardDescription>
              </CardHeader>
              
              <CardContent className="space-y-4">
                {/* Fees Section */}
                <div>
                  <h4 className="font-medium text-sm text-gray-900 mb-2">Processing Fees:</h4>
                  <div className="space-y-2">
                    {option.fees.map((fee, index) => (
                      <div 
                        key={index}
                        className={`text-sm flex justify-between items-center p-2 rounded ${
                          'noFee' in fee && fee.noFee ? 'bg-green-50' : 'bg-gray-50'
                        }`}
                      >
                        <span className="text-gray-700">{fee.type}</span>
                        <div className="text-right">
                          <div className={`font-medium ${'noFee' in fee && fee.noFee ? 'text-green-700' : 'text-gray-900'}`}>
                            {fee.fee}
                          </div>
                          <div className="text-xs text-gray-500">{fee.example}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Benefits Section */}
                <div>
                  <h4 className="font-medium text-sm text-gray-900 mb-2">Features:</h4>
                  <ul className="space-y-1">
                    {option.benefits.map((benefit, index) => (
                      <li key={index} className="flex items-start text-sm text-gray-600">
                        <Check className="w-4 h-4 text-green-600 mr-2 mt-0.5 flex-shrink-0" />
                        {benefit}
                      </li>
                    ))}
                  </ul>
                </div>

                <Button 
                  onClick={option.action}
                  variant={option.buttonVariant}
                  className="w-full"
                >
                  {option.buttonText}
                </Button>
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
} 