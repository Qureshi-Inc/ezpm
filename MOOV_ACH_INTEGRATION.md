# Moov ACH Integration

This document describes the Moov ACH payment method integration added to the EZ Property Manager application.

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
- Created `lib/moov-server.ts` for server-side Moov operations
- Created `lib/moov-client.ts` for client-side Moov.js integration
- Updated `utils/helpers.ts` to handle Moov payment method icons

### 5. API Routes
- Created `/api/moov/token/route.ts` - Generates Moov access tokens for frontend
- Created `/api/tenant/payment-methods/moov/route.ts` - Handles adding Moov ACH payment methods
- Updated `/api/tenant/payments/process/route.ts` - Added Moov ACH payment processing logic

### 6. UI Components
- Created `components/forms/MoovPaymentMethodForm.tsx` - Form for adding bank accounts via Moov
- Updated `components/forms/StripePaymentForm.tsx` - Added support for displaying Moov ACH methods

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
   MOOV_DOMAIN=https://api.moov.io
   ```

3. **Run Database Migration**
   Execute the SQL script in `supabase/add_moov_support.sql` to update your database schema.

## How It Works

1. **Adding a Moov Bank Account**:
   - Tenant navigates to Payment Methods page
   - Clicks "Add Bank Account (ACH)" button
   - Fills out bank account information (account holder name, routing number, account number)
   - System creates a Moov account for the tenant if one doesn't exist
   - Bank account is saved as a payment method

2. **Making a Payment with Moov ACH**:
   - Tenant selects a Moov ACH payment method when making a payment
   - System initiates an ACH transfer through Moov
   - Payment status is set to "processing" (ACH takes 1-3 business days)
   - Webhooks would handle the final status updates (not fully implemented)

## Current Limitations

1. **Simplified Implementation**: The current implementation is a proof of concept. Production use would require:
   - Full Moov API integration for creating transfers
   - Webhook handling for transfer status updates
   - Proper error handling and retry logic
   - Bank account verification (micro-deposits or instant verification)

2. **Missing Features**:
   - Bank account verification
   - Real transfer creation
   - Webhook endpoints for transfer status updates
   - Refund handling for ACH payments

## Security Considerations

- Bank account information is never stored directly - only the last 4 digits are saved
- All sensitive operations happen server-side
- Moov handles the secure storage of bank account details
- API credentials are stored as environment variables

## Next Steps

To complete the Moov ACH integration for production use:

1. Implement proper Moov transfer creation in the payment processing route
2. Add webhook endpoints to handle transfer status updates
3. Implement bank account verification flow
4. Add proper error handling and retry logic
5. Create admin tools for managing Moov transfers
6. Add refund capabilities for ACH payments
7. Implement proper logging and monitoring 