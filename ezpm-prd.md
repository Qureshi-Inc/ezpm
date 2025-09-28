# Product Requirements Document (PRD)
## EZ Property Manager (EZPM) - Rent Payment Platform

### 1. Product Overview

**Product Name:** EZ Property Manager (EZPM)
**Version:** 1.0
**Product Type:** SaaS Web Application
**Target Market:** Property managers, landlords, and rental property tenants

**Product Vision:** Streamline rent collection and payment processing with minimal fees, automated workflows, and seamless user experience for both property managers and tenants.

### 2. Business Objectives

**Primary Goals:**
- Reduce payment processing costs for tenants (ACH = 0% fees vs. credit cards = 2.9% + $0.30)
- Automate rent collection workflows for property managers
- Improve payment reliability and reduce late payments
- Provide comprehensive financial tracking and reporting

**Success Metrics:**
- 95% payment success rate
- 50% reduction in late payments
- 80% tenant adoption of ACH payments
- 99.5% uptime for payment processing

### 3. Target Users

#### 3.1 Property Managers/Landlords
- **Primary Persona:** Small to medium property management companies (1-500 units)
- **Pain Points:** Manual rent collection, payment processing fees, tenant communication, financial tracking
- **Goals:** Automate workflows, reduce costs, improve cash flow

#### 3.2 Tenants
- **Primary Persona:** Renters aged 25-45, tech-savvy, prefer digital payments
- **Pain Points:** Payment processing fees, inconvenient payment methods, lack of payment history
- **Goals:** Easy payments, low/no fees, payment tracking, automated payments

### 4. Core Features

#### 4.1 Authentication & User Management
**Requirements:**
- Role-based access control (admin, property_manager, tenant)
- Secure login with session management
- User profile management
- Email verification (optional)

**Acceptance Criteria:**
- Users can register and login securely
- Different dashboards based on user role
- Profile information can be updated
- Passwords are encrypted and secure

#### 4.2 Property Management
**Requirements:**
- Create and manage properties
- Add multiple units per property
- Set rent amounts and due dates
- Assign tenants to units

**Acceptance Criteria:**
- Property managers can create unlimited properties
- Each property can have multiple units
- Rent amounts can be set per unit
- Tenant assignments are tracked with lease information

#### 4.3 Payment Processing
**Requirements:**
- Multiple payment methods (ACH via Moov, Cards via Stripe)
- Secure payment method storage (tokenized)
- One-time and recurring payments
- Payment history and receipts

**Acceptance Criteria:**
- ACH payments have 0% processing fees
- Credit/debit cards have 2.9% + $0.30 fees
- Payment methods are stored securely (PCI compliant)
- Payment status is tracked in real-time
- Users can download payment receipts

#### 4.4 Bank Account Verification
**Requirements:**
- Micro-deposit verification for ACH accounts
- Automated micro-deposit initiation
- Verification workflow with clear instructions
- Test account support (0.00 amounts)

**Acceptance Criteria:**
- Micro-deposits are initiated automatically when bank accounts are added
- Users receive clear instructions for verification
- Verification can be completed with deposit amounts
- Test accounts can use 0.00 amounts for instant verification

#### 4.5 Auto-Pay Setup
**Requirements:**
- Recurring monthly payments
- Customizable payment dates
- Payment method selection
- Auto-pay management

**Acceptance Criteria:**
- Tenants can set up auto-pay for rent
- Payment date can be customized (e.g., 1st of month)
- Auto-pay can be enabled/disabled/modified
- Failed payments are handled gracefully with notifications

#### 4.6 Dashboard & Reporting
**Requirements:**
- Role-specific dashboards
- Payment status tracking
- Financial reporting
- Export capabilities

**Acceptance Criteria:**
- Property managers see all properties and payments
- Tenants see their payment history and upcoming payments
- Reports can be generated and exported
- Real-time payment status updates

### 5. Technical Requirements

#### 5.1 Technology Stack
- **Frontend:** Next.js 14+, React, TypeScript, Tailwind CSS, shadcn/ui
- **Backend:** Next.js API routes, server-side rendering
- **Database:** Supabase (PostgreSQL)
- **Authentication:** Custom auth system with bcrypt
- **Payment Processing:** Moov (ACH), Stripe (Cards)
- **Deployment:** Self-hosted or cloud deployment

#### 5.2 Environment Configuration
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

#### 5.3 Security Requirements
- All payment data must be tokenized (never store raw card/bank details)
- PCI DSS compliance for card payments
- Encrypted data transmission (HTTPS)
- Secure session management
- Role-based access controls
- Input validation and sanitization

#### 5.4 Performance Requirements
- Page load times < 3 seconds
- Payment processing < 10 seconds
- 99.5% uptime SLA
- Support for 1000+ concurrent users
- Database query optimization

### 6. Database Schema

#### 6.1 Core Tables
```sql
users (id, email, password_hash, first_name, last_name, phone, role, is_active, created_at, updated_at)
properties (id, name, address, property_manager_id, created_at, updated_at)
units (id, property_id, unit_number, rent_amount, created_at, updated_at)
tenants (id, user_id, first_name, last_name, phone, created_at, updated_at)
leases (id, tenant_id, unit_id, start_date, end_date, rent_amount, created_at, updated_at)
payment_methods (id, tenant_id, type, last4, is_default, is_verified, moov_payment_method_id, stripe_payment_method_id, created_at, updated_at)
payments (id, tenant_id, amount, status, payment_method_id, due_date, paid_date, created_at, updated_at)
auto_payments (id, tenant_id, payment_method_id, amount, day_of_month, is_active, created_at, updated_at)
```

### 7. User Workflows

#### 7.1 Tenant Payment Flow
1. Tenant logs into dashboard
2. Views upcoming rent payment
3. Selects payment method (or adds new one)
4. For ACH: Completes bank account verification if needed
5. Submits payment
6. Receives confirmation and receipt

#### 7.2 Property Manager Setup Flow
1. Property manager creates account
2. Adds properties and units
3. Invites tenants or provides signup links
4. Monitors payment status
5. Generates reports

#### 7.3 Bank Account Verification Flow
1. Tenant adds bank account details
2. System initiates micro-deposits via Moov
3. Tenant waits 1-2 business days for deposits
4. Tenant enters deposit amounts for verification
5. Account is marked as verified and ready for use

### 8. API Specifications

#### 8.1 Payment Endpoints
- `POST /api/tenant/payments/process` - Process payment
- `GET /api/tenant/payments/history` - Payment history
- `POST /api/tenant/payment-methods/moov` - Add ACH account
- `POST /api/tenant/payment-methods/verify-micro-deposits` - Verify bank account

#### 8.2 Webhook Endpoints
- `POST /api/webhooks/moov` - Moov payment updates
- `POST /api/webhooks/stripe` - Stripe payment updates

### 9. Integration Requirements

#### 9.1 Moov Integration
- OAuth 2.0 authentication with facilitator pattern
- Account creation and management
- Bank account verification via micro-deposits
- ACH payment processing
- Webhook handling for payment updates

#### 9.2 Stripe Integration
- Payment method tokenization
- Card payment processing
- Webhook handling for payment events
- Subscription management (future feature)

### 10. Compliance & Legal

#### 10.1 Financial Compliance
- PCI DSS Level 1 compliance (via Stripe)
- ACH compliance (via Moov)
- Data encryption at rest and in transit
- Regular security audits

#### 10.2 Privacy & Data Protection
- User data privacy controls
- GDPR compliance considerations
- Data retention policies
- Secure data deletion

### 11. Future Enhancements (Phase 2+)

#### 11.1 Advanced Features
- Late fee automation
- Payment reminders and notifications
- Maintenance request system
- Lease management
- Financial analytics and insights
- Mobile application
- Multi-language support

#### 11.2 Integration Expansions
- Property management software integrations
- Accounting software connections (QuickBooks, Xero)
- Credit reporting integration
- Background check services

### 12. Success Criteria & KPIs

#### 12.1 Technical KPIs
- 99.5% payment processing success rate
- < 3 second average page load time
- < 1% payment disputes/chargebacks
- Zero security incidents

#### 12.2 Business KPIs
- 80% of tenants use ACH payments (vs. cards)
- 90% tenant satisfaction score
- 50% reduction in late payments
- 95% property manager retention rate

### 13. Risk Assessment

#### 13.1 Technical Risks
- **Payment processor downtime:** Mitigate with dual processors
- **Security vulnerabilities:** Regular security audits and updates
- **Database failures:** Automated backups and failover systems

#### 13.2 Business Risks
- **Regulatory changes:** Stay updated with financial regulations
- **Competition:** Focus on user experience and low fees
- **Market adoption:** Provide excellent onboarding and support

This PRD serves as the foundation for development, testing, and product management decisions for the EZPM platform.