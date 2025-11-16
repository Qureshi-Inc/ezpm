# Moov Drops Migration Guide

## Overview
This document outlines the migration from custom Moov.js integration to Moov Drops for payment method management.

## What Changed

### Before (Hand-rolled Implementation)
- Custom forms for bank account data collection
- Manual API calls to Moov endpoints
- Complex multi-step onboarding flow
- Manual micro-deposit verification
- Custom UI components for all payment interactions

### After (Moov Drops Implementation)
- Pre-built, PCI-safe UI components from Moov
- Automatic API calls handled by Moov Drops
- Simplified single-step payment method addition
- Optional Plaid integration for instant verification
- Moov's tested and optimized user experience

## New Architecture

### Backend Changes

1. **New Token Endpoint**: `/api/moov/token/payment-methods`
   - Generates JWT tokens with payment method scopes
   - Uses account-specific scopes for Drops compatibility
   - Only returns tokens, never API keys to browser

2. **New Save Endpoint**: `/api/payment-methods/moov/save`
   - Handles payment method data from Drop callbacks
   - Supports both bank accounts and cards
   - Automatic tenant association

3. **Updated Scopes**:
   ```
   /fed.read
   /accounts/{accountId}/cards.read
   /accounts/{accountId}/cards.write
   /accounts/{accountId}/bank-accounts.read
   /accounts/{accountId}/bank-accounts.write
   ```

### Frontend Changes

1. **Moov.js Loading**: Added to `app/layout.tsx`
   ```html
   <script src="https://js.moov.io/v1" async></script>
   ```

2. **New Drop Component**: `app/tenant/payment-methods/add-moov-drops/page.tsx`
   - Handles `<moov-payment-methods>` element
   - Configures callbacks and Plaid integration
   - Manages success/error states

3. **Updated Navigation**: Payment method selection now routes to Drops by default

### Database Schema Updates

Run `update-payment-methods-for-drops.sql` to add:
- `is_verified` boolean field
- `is_active` boolean field
- `last_four` field (alias for `last4`)
- Enhanced `status` constraints

## Migration Steps

### 1. Database Updates
```sql
-- Run the schema update
\i update-payment-methods-for-drops.sql
```

### 2. Environment Variables
Ensure these are set:
- `MOOV_PUBLIC_KEY`
- `MOOV_SECRET_KEY`
- `NEXT_PUBLIC_MOOV_FACILITATOR_ACCOUNT_ID`

### 3. Testing Flow
1. Go to `/tenant/payment-methods/add-new`
2. Select "Bank Account (ACH)"
3. Should redirect to `/tenant/payment-methods/add-moov-drops`
4. Moov Drop should load with secure payment form
5. After successful linking, should save to database and redirect

### 4. Rollback Plan
The original manual flow is still available at `/tenant/onboarding/moov` for fallback.

## Key Benefits

1. **Security**: PCI-compliant forms handled by Moov
2. **User Experience**: Professional, tested UI components
3. **Maintenance**: Less custom code to maintain
4. **Features**: Optional Plaid instant verification
5. **Reliability**: Moov's battle-tested components

## Development Notes

- Drops require account-specific OAuth scopes (different from facilitator pattern)
- Plaid integration is configured for sandbox by default
- Original manual flow preserved as fallback option
- All payment method data still flows through existing database schema

## Support

- Moov Drops Documentation: https://docs.moov.io/drops/
- Original manual flow available as backup
- Database schema remains backward compatible