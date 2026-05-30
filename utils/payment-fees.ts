// Stripe fee structure for ezpm.
// Source: https://stripe.com/pricing  (verified 2026-05)
// Card:            2.9% + $0.30 per transaction (no cap)
// us_bank_account: 0.8% per transaction, capped at $5.00

const STRIPE_CARD_PERCENTAGE = 0.029
const STRIPE_CARD_FIXED = 0.30
const STRIPE_ACH_PERCENTAGE = 0.008
const STRIPE_ACH_CAP = 5.00

export type PaymentMethodType = 'card' | 'us_bank_account'

export interface ProcessingFee {
  amount: number
  description: string
  totalWithFee: number
}

export function calculateProcessingFee(
  amount: number,
  paymentType: PaymentMethodType
): ProcessingFee {
  let feeAmount = 0
  let description = ''

  switch (paymentType) {
    case 'card':
      feeAmount = (amount * STRIPE_CARD_PERCENTAGE) + STRIPE_CARD_FIXED
      description = '2.9% + $0.30 processing fee'
      break

    case 'us_bank_account':
      feeAmount = Math.min(amount * STRIPE_ACH_PERCENTAGE, STRIPE_ACH_CAP)
      description = feeAmount >= STRIPE_ACH_CAP
        ? '0.8% (capped at $5.00) processing fee'
        : '0.8% processing fee'
      break
  }

  const rounded = Math.round(feeAmount * 100) / 100
  return {
    amount: rounded,
    description,
    totalWithFee: amount + rounded,
  }
}

export function formatFeeDisplay(fee: ProcessingFee): string {
  return `Processing fee: $${fee.amount.toFixed(2)} (${fee.description})`
}
