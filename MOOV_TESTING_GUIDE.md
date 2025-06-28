# Moov ACH Testing Guide

## Prerequisites ✅

You're all set with:
- ✅ Test API keys configured
- ✅ Sandbox domain: `https://api.sandbox.moov.io`
- ✅ Test Moov Account ID

## Test Bank Account Information

For Moov sandbox testing, you can use these test bank account details:

### Valid Test Accounts
```
Routing Number: 021000021 (JPMorgan Chase)
Account Number: 1234567890
Account Type: Checking or Savings
```

Alternative test routing numbers:
- `011401533` - Bank of America
- `091000019` - Wells Fargo
- `121000358` - Bank of America California

## Testing Steps

### 1. Start Your Application
```bash
npm run dev
```

### 2. Test Adding a Bank Account
1. Login as a tenant
2. Navigate to `/tenant/payment-methods`
3. Click "Add Bank Account (ACH)"
4. Enter the test bank details above
5. Submit the form

### 3. Expected Behavior
- Bank account should be added successfully
- You should see "No fee" badge on the Moov payment method
- The account should appear in your payment methods list

### 4. Test Making a Payment
1. Go to `/tenant/pay`
2. Select your Moov ACH payment method
3. Notice:
   - No processing fee is added
   - Total equals the rent amount
4. Click "Pay" to process

### 5. What to Expect in Sandbox

**Successful Flow:**
- Payment will show as "processing"
- In production, ACH takes 1-3 business days
- In sandbox, status updates may be simulated

**Error Testing:**
To test error scenarios, you can use:
- Invalid routing number: `000000000`
- Account that will fail: `9900000000`

## Troubleshooting

### Common Issues

1. **"Invalid credentials" error**
   - Verify your test API keys are correct
   - Ensure you're using sandbox domain

2. **Bank account validation fails**
   - Use only the test routing/account numbers above
   - Check that account type is "checking" or "savings"

3. **Payment fails to process**
   - Check browser console for errors
   - Verify tenant has a `moov_account_id` in database

### Debug Logging

The application logs key information:
- API token generation
- Bank account creation
- Payment processing steps

Check your terminal running `npm run dev` for these logs.

## Notes

- Sandbox environment doesn't charge real money
- Webhooks in sandbox may behave differently than production
- Some features like micro-deposits are simulated

## Moving to Production

When ready for production:
1. Update `.env.local` with production credentials
2. Change `MOOV_DOMAIN` to `https://api.moov.io`
3. Update any test-specific code
4. Implement proper webhook handling
5. Add production error handling 