// Stripe fee structure
const STRIPE_CARD_PERCENTAGE = 0.029 // 2.9%
const STRIPE_CARD_FIXED = 0.30 // $0.30

// Moov ACH fees (example - adjust based on your Moov pricing)
const MOOV_ACH_PERCENTAGE = 0.005 // 0.50%
const MOOV_ACH_FIXED = 0.00 // No fixed fee

export interface ProcessingFee {
  amount: number
  description: string
  totalWithFee: number
}

export function calculateProcessingFee(
  amount: number, 
  paymentType: 'card' | 'moov_ach'
): ProcessingFee {
  let feeAmount = 0
  let description = ''

  switch (paymentType) {
    case 'card':
      // Stripe card fee: 2.9% + $0.30
      feeAmount = (amount * STRIPE_CARD_PERCENTAGE) + STRIPE_CARD_FIXED
      description = '2.9% + $0.30 processing fee'
      break
      
    case 'moov_ach':
      // No fee charged to tenants for Moov ACH - merchant absorbs the 0.50% fee
      feeAmount = 0
      description = 'No processing fee'
      break
  }

  return {
    amount: Math.round(feeAmount * 100) / 100, // Round to 2 decimal places
    description,
    totalWithFee: amount + Math.round(feeAmount * 100) / 100
  }
}

// Helper to format fee display
export function formatFeeDisplay(fee: ProcessingFee): string {
  return `Processing fee: $${fee.amount.toFixed(2)} (${fee.description})`
} 