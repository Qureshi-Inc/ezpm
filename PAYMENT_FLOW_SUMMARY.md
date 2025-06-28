# Payment Flow Summary

## Updated User Payment Journey

### Starting a Payment

1. **From Dashboard**: User clicks "Pay Now" button
2. **Make Payment Page**: Shows payment details and amount due

### No Payment Method Flow

When a user has no payment methods:

1. **Warning Message**: "No Payment Methods - You need to add a payment method before you can make a payment"
2. **Add Payment Method Button**: Clicking this now takes user to `/tenant/payment-methods/add-new`

### Payment Method Selection Page

The unified selection page shows:

1. **Two Clear Options Side-by-Side**:
   - **Credit/Debit Card (Stripe)**
     - Processing fee: 2.9% + $0.30
     - Instant processing
     - All major cards supported
   
   - **Bank Account ACH (Moov)** *(Recommended)*
     - No processing fees
     - 1-3 day processing
     - Direct bank transfer

2. **Visual Indicators**:
   - Moov option has "Recommended - No Fees!" badge
   - Clear fee breakdown for each option
   - Example calculations shown

### After Adding Payment Method

1. User is redirected back to payment methods page
2. Can then return to "Pay Now" to complete payment
3. Payment form shows selected method with applicable fees

## Key Improvements

- **Single Entry Point**: All payment method additions go through selection page first
- **Transparent Fees**: Users see fees before choosing payment type
- **Clear Separation**: Stripe = Cards only, Moov = Bank accounts only
- **User Choice**: Informed decision between convenience (cards) vs savings (ACH)

## Payment Processing

- **Credit/Debit Cards**: Processed immediately with fees added
- **Bank ACH**: No fees for tenant, takes 1-3 business days
- Both methods show clear status and confirmation 