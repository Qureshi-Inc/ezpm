# Payment Processing Fees

This document explains how payment processing fees work in the EZ Property Manager application.

## Fee Structure

Payment processing fees are handled differently depending on the payment method:

| Payment Method | Provider | Fee Charged to Tenant | Fee Paid by Landlord | Example ($1,000 rent) |
|----------------|----------|----------------------|---------------------|----------------------|
| Credit/Debit Card | Stripe | 2.9% + $0.30 | None | Tenant pays $1,029.30 |
| US Bank Account | Stripe | 0.8% (max $5) | None | Tenant pays $1,008.00 |
| ACH Transfer | Moov | **No fee** | 0.50% | Tenant pays $1,000.00 |

## How It Works

### Stripe Payments (Cards & Bank Accounts)
1. **Fee Calculation**: The system calculates Stripe's processing fee based on the rent amount
2. **Tenant Pays**: The fee is added to the tenant's payment (rent + fee)
3. **Transparent Display**: Tenants see the breakdown before confirming payment

### Moov ACH Payments
1. **No Tenant Fees**: Tenants pay only the rent amount with no additional fees
2. **Landlord Absorbs Fee**: The 0.50% Moov fee is deducted from the landlord's merchant account
3. **Better for Tenants**: This provides a no-fee payment option for tenants

## Implementation Details

### Frontend
- `utils/payment-fees.ts` - Contains fee calculation logic (returns 0 for Moov)
- `components/forms/StripePaymentForm.tsx` - Shows fees during payment
- Fee notices display which payment methods have fees

### Backend
- `app/api/tenant/payments/process/route.ts` - Calculates fees (0 for Moov)
- Only Stripe payments include fees in the total amount

### Database
- The base rent amount remains unchanged in the database
- Stripe fees are added during the transaction
- Moov payments process at the base rent amount

## Customizing Fees

To change the fee structure, update the constants in `utils/payment-fees.ts`:

```typescript
const STRIPE_CARD_PERCENTAGE = 0.029 // 2.9%
const STRIPE_CARD_FIXED = 0.30 // $0.30
const STRIPE_ACH_PERCENTAGE = 0.008 // 0.8%
const STRIPE_ACH_CAP = 5.00 // $5.00 cap
const MOOV_ACH_PERCENTAGE = 0.005 // 0.50% (paid by landlord, not tenant)
```

## Legal Considerations

- Ensure your lease agreements allow passing processing fees to tenants
- Check local regulations about fee disclosure requirements
- Consider offering a no-fee payment option (like cash or check) if required by law

## Alternative Approaches

If you prefer not to pass fees to tenants:

1. **Absorb Fees**: Remove the fee calculation and charge only the base rent
2. **Flat Fee**: Charge a fixed convenience fee regardless of payment method
3. **Tiered Pricing**: Offer discounts for lower-fee payment methods 