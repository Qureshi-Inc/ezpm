# Moov ACH Integration

This document describes the complete Moov ACH payment method integration added to the EZ Property Manager application.

## Overview

Moov ACH has been added as an additional payment method alongside the existing Stripe payment options (credit cards and US bank accounts). This provides tenants with another option for making rent payments via ACH bank transfers.

## What Was Implemented

### 1. Environment Configuration
- Added Moov API credentials to `.env.example`:
  - `MOOV_ACCOUNT_ID`
  - `MOOV_PUBLIC_KEY`
  - `MOOV_SECRET_KEY`
  - `MOOV_DOMAIN`

### 2. Database Schema Updates
- Created `supabase/add_moov_support.sql` migration script:
  - Added `moov_account_id` to `tenants` table
  - Added `moov_payment_method_id` to `payment_methods` table
  - Added `moov_transfer_id` to `payments` table
  - Updated payment method type constraint to include `'moov_ach'`

### 3. Type Definitions
- Updated `PaymentMethod` interface in `types/index.ts` to support:
  - `moov_payment_method_id` field
  - `'moov_ach'` payment method type

### 4. Libraries and Utilities
- Created `lib/moov-server.ts` for server-side Moov operations:
  - `createMoovAccount()` - Creates individual accounts for tenants
  - `createBankAccount()` - Links bank accounts to tenant accounts
  - `createTransfer()` - Creates ACH transfers between accounts
  - `getTransferStatus()` - Checks transfer status
  - `generateMoovToken()` - Generates access tokens for frontend
- Created `lib/moov-client.ts` for client-side Moov.js integration
- Updated `utils/helpers.ts` to handle Moov payment method icons

### 5. API Routes
- Created `/api/moov/token/route.ts` - Generates Moov access tokens for frontend
- Created `/api/tenant/payment-methods/moov/route.ts` - Handles adding Moov ACH payment methods
- Updated `/api/tenant/payments/process/route.ts` - Added complete Moov ACH payment processing
- Created `/api/webhooks/moov/route.ts` - Handles Moov webhook events for transfer status updates
- Created `/api/tenant/payments/check-status/route.ts` - Manual transfer status checking

### 6. UI Components
- Created `components/forms/MoovPaymentMethodForm.tsx` - Form for adding bank accounts via Moov
- Updated `components/forms/StripePaymentForm.tsx` - Added support for displaying Moov ACH methods
- Created `components/ui/alert.tsx` - Alert component for error messages

### 7. Pages
- Created `/tenant/payment-methods/add-moov` page - Dedicated page for adding Moov ACH payment methods
- Updated `/tenant/payment-methods` page - Shows Moov ACH payment methods and provides buttons for both payment providers

## Setup Instructions

1. **Install Dependencies**
   ```bash
   npm install @moovio/sdk @moovio/moov-js
   ```

2. **Configure Environment Variables**
   Add the following to your `.env.local`:
   ```
   MOOV_ACCOUNT_ID=your_moov_account_id
   MOOV_PUBLIC_KEY=your_moov_public_key
   MOOV_SECRET_KEY=your_moov_secret_key
   MOOV_DOMAIN=https://api.sandbox.moov.io
   ```
   
   **Note**: Get your API keys from the Moov dashboard at https://dashboard.moov.io > API Keys. You need both the public key (client_id) and secret key (client_secret) for OAuth 2.0 authentication.

3. **Run Database Migration**
   Execute the SQL script in `supabase/add_moov_support.sql` to update your database schema.

4. **Configure Webhooks (Production)**
   In production, configure Moov webhooks to point to:
   ```
   https://yourdomain.com/api/webhooks/moov
   ```

## How It Works

### 1. Adding a Moov Bank Account
1. Tenant navigates to Payment Methods page
2. Clicks "Add Bank Account (ACH)" button
3. Fills out bank account information:
   - Account holder name
   - Routing number (9 digits)
   - Account number
   - Account type (checking/savings)
4. System creates a Moov account for the tenant if one doesn't exist
5. System creates the bank account in Moov and links it to the tenant's account
6. Bank account is saved as a payment method in the database

### 2. Making a Payment with Moov ACH
1. Tenant selects a Moov ACH payment method when making a payment
2. System creates an actual ACH transfer through Moov API:
   - Source: Tenant's linked bank account
   - Destination: Merchant account (your Moov account)
   - Amount: Rent amount (no fees charged to tenant)
3. Payment status is set to "processing" (ACH takes 1-3 business days)
4. Webhooks handle the final status updates when transfers complete/fail

### 3. Transfer Status Updates
- **Webhooks**: Automatically update payment status when transfers complete/fail
- **Manual Check**: Tenants can manually check transfer status via API
- **Status Mapping**:
  - `pending` → `processing`
  - `completed` → `succeeded`
  - `failed` → `failed`
  - `canceled` → `failed`

## Security Features

- **Server-side Processing**: All sensitive operations happen server-side
- **No Local Storage**: Bank account information is never stored locally
- **Moov Security**: Moov handles secure storage of bank account details
- **Environment Variables**: API credentials stored securely
- **Webhook Verification**: Production should include signature verification

## Testing

### Sandbox Testing
Use these test bank account details:
```
Routing Number: 021000021 (JPMorgan Chase)
Account Number: 1234567890
Account Type: Checking
Account Holder: Any valid name
```

### Manual Status Checking
For testing purposes, you can manually check transfer status:
```bash
curl -X POST http://localhost:3000/api/tenant/payments/check-status \
  -H "Content-Type: application/json" \
  -d '{"paymentId": "your-payment-id"}'
```

## Production Considerations

### 1. Webhook Security
- Implement webhook signature verification
- Use HTTPS endpoints
- Add rate limiting

### 2. Bank Account Verification
- Implement micro-deposits verification
- Add instant verification where available
- Handle verification failures gracefully

### 3. Error Handling
- Add retry logic for failed transfers
- Implement proper error logging
- Add monitoring and alerting

### 4. Compliance
- Ensure PCI compliance for handling bank data
- Follow ACH network rules and regulations
- Implement proper audit trails

## API Reference

### Server Functions (`lib/moov-server.ts`)

#### `createMoovAccount(tenantData)`
Creates a new Moov account for a tenant.

#### `createBankAccount(accountId, bankData)`
Links a bank account to a Moov account.

#### `createTransfer(transferData)`
Creates an ACH transfer between accounts.

#### `getTransferStatus(transferId)`
Gets the current status of a transfer.

#### `generateMoovToken(scopes)`
Generates access tokens for frontend operations.

### API Endpoints

#### `POST /api/tenant/payment-methods/moov`
Adds a new Moov ACH payment method.

#### `POST /api/tenant/payments/process`
Processes payments (supports both Stripe and Moov).

#### `POST /api/webhooks/moov`
Handles Moov webhook events.

#### `POST /api/tenant/payments/check-status`
Manually checks transfer status.

## Troubleshooting

### Common Issues

1. **"Invalid credentials" error**
   - Verify your API keys are correct
   - Ensure you're using the correct domain (sandbox vs production)

2. **Bank account creation fails**
   - Use valid test routing/account numbers
   - Check that account type is "checking" or "savings"
   - Verify account holder name format

3. **Transfer creation fails**
   - Ensure tenant has a valid Moov account
   - Check that bank account is properly linked
   - Verify merchant account ID is correct

4. **Webhook not receiving events**
   - Check webhook URL configuration in Moov dashboard
   - Verify endpoint is accessible
   - Check webhook signature verification

### Debug Logging
The implementation includes comprehensive logging for debugging:
- Account creation steps
- Bank account linking
- Transfer creation
- Status updates
- Error details 