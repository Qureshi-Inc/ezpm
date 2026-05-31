'use client'

import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { PaymentMethodActions } from '@/components/tenant/PaymentMethodActions'
import { getPaymentMethodIcon } from '@/utils/helpers'
import { AlertCircle } from 'lucide-react'
import type { PaymentMethodType } from '@/utils/payment-fees'
import type { PaymentMethodVerificationStatus } from '@/types'

interface PaymentMethod {
  id: string
  type: PaymentMethodType
  last4: string | null
  bank_name?: string | null
  card_brand?: string | null
  is_default: boolean
  verification_status?: PaymentMethodVerificationStatus
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
      {paymentMethods.map((method) => {
        const status = method.verification_status ?? 'verified'
        const isPending = status === 'pending_microdeposits'
        const isFailed = status === 'failed'
        const borderClass = isPending
          ? 'border-warning/30 bg-warning/10'
          : isFailed
            ? 'border-destructive/30 bg-destructive/10'
            : 'border-border'

        return (
          <div
            key={method.id}
            className={`p-4 border-2 rounded-lg space-y-3 ${borderClass}`}
          >
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-3 sm:space-y-0">
              <div className="flex items-center space-x-4">
                <div className="w-12 h-12 bg-accent rounded-full flex items-center justify-center flex-shrink-0">
                  <span className="text-xl">{getPaymentMethodIcon(method.type)}</span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-foreground">{describe(method)}</p>
                  <p className="text-sm text-muted-foreground">****{method.last4 ?? '••••'}</p>
                  <div className="flex items-center gap-2 mt-1">
                    {method.is_default && (
                      <Badge variant="default" className="text-xs">Default</Badge>
                    )}
                    {isPending && (
                      <Badge variant="outline" className="text-xs text-warning border-warning/40">
                        Pending verification
                      </Badge>
                    )}
                    {isFailed && (
                      <Badge variant="outline" className="text-xs text-destructive border-destructive/40">
                        Verification failed
                      </Badge>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex justify-end sm:justify-start">
                <PaymentMethodActions paymentMethod={method} />
              </div>
            </div>

            {isPending && (
              <div className="flex items-start space-x-2 pt-2 border-t border-warning/20">
                <AlertCircle className="w-4 h-4 text-warning mt-0.5 flex-shrink-0" />
                <div className="flex-1">
                  <p className="text-sm text-warning">
                    Stripe sent two small test deposits. Check your bank in 1-2 business days, then verify the amounts here.
                  </p>
                  <Link href={`/tenant/payment-methods/${method.id}/verify`} className="inline-block mt-2">
                    <Button size="sm">Verify Now</Button>
                  </Link>
                </div>
              </div>
            )}

            {isFailed && (
              <div className="flex items-start space-x-2 pt-2 border-t border-destructive/20">
                <AlertCircle className="w-4 h-4 text-destructive mt-0.5 flex-shrink-0" />
                <p className="text-sm text-destructive">
                  Too many failed attempts. Remove this account and add it again to retry.
                </p>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
