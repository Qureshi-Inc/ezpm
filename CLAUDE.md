# CLAUDE.md - EZPM Project Context

## Project Overview
**EZ Property Manager (EZPM)** - A rent payment platform that streamlines rent collection and payment processing with minimal fees, automated workflows, and seamless user experience for both property managers and tenants.

## Key Features
- **Payment Processing**: ACH via Moov (0% fees), Cards via Stripe (2.9% + $0.30)
- **Bank Verification**: Micro-deposit verification for ACH accounts
- **Auto-Pay**: Recurring monthly rent payments
- **Property Management**: Multi-unit property and tenant management
- **Role-based Access**: Admin, property manager, and tenant roles

## Technology Stack
- **Frontend**: Next.js 14+, React, TypeScript, Tailwind CSS, shadcn/ui
- **Backend**: Next.js API routes
- **Database**: Supabase (PostgreSQL)
- **Authentication**: Custom auth with bcrypt (not Supabase Auth)
- **Payments**: Moov (ACH), Stripe (Cards)

## Environment Variables
```
MOOV_ACCOUNT_ID                      # Facilitator account ID
MOOV_DOMAIN                          # API endpoint
MOOV_PUBLIC_KEY                      # API credentials
MOOV_SECRET_KEY                      # API credentials
NEXT_PUBLIC_MOOV_FACILITATOR_ACCOUNT_ID
STRIPE_SECRET_KEY                    # Stripe API key
STRIPE_WEBHOOK_SECRET                # Webhook verification
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
SUPABASE_SERVICE_ROLE_KEY            # Database access
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
NEXT_PUBLIC_APP_URL                  # Application URL
```

## Database Schema (Core Tables)
- `users` - User accounts with roles (admin, property_manager, tenant)
- `properties` - Property information
- `units` - Individual rental units within properties
- `tenants` - Tenant profiles linked to users
- `leases` - Tenant-unit lease agreements
- `payment_methods` - Tokenized payment methods (ACH/Card)
- `payments` - Payment transactions and history
- `auto_payments` - Recurring payment settings

## Key Integrations

### Moov Integration (ACH Payments)
- Uses facilitator pattern for connected accounts
- OAuth 2.0 authentication with scopes:
  - `/accounts.read`, `/accounts.write`
  - `/bank-accounts.read`, `/bank-accounts.write`
  - `/payment-methods.read`, `/payment-methods.write`
  - `/capabilities.read`, `/capabilities.write`
- Micro-deposit verification workflow
- Webhook handling for payment updates

### Stripe Integration (Card Payments)
- Payment method tokenization
- Card payment processing
- Webhook handling for payment events

## Important Implementation Notes

### Authentication
- Custom authentication system (not Supabase Auth)
- Password hashing with bcrypt
- Role-based access control
- Session management

### Payment Flow
1. Tenant adds bank account via Moov widget
2. System initiates micro-deposits automatically
3. Tenant verifies deposits (or uses 0.00 for test accounts)
4. Payment method becomes available for rent payments
5. Auto-pay can be configured for recurring payments

### Security Requirements
- All payment data tokenized (never store raw details)
- PCI DSS compliance via Stripe
- HTTPS encryption
- Input validation and sanitization
- Secure session management

## Development Commands
- Build: `npm run build`
- Dev: `npm run dev`
- Lint: `npm run lint` (if available)
- Test: Check package.json for test scripts

## Recent Technical Fixes
- Fixed Moov OAuth scope configuration for facilitator pattern
- Resolved account ID passing issues in payment method creation
- Fixed React state timing issues in Moov widget callbacks
- Implemented proper micro-deposit verification workflow

For complete requirements, see `ezpm-prd.md`