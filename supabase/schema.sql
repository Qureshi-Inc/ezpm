-- EZPM schema (Zitadel auth + Stripe Subscriptions edition)
-- Replaces all prior schemas + ad-hoc migration files.
-- Cutover procedure: see MIGRATION.md. Wipe-and-recreate from this file.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- USERS: identity mapped to Zitadel
-- ============================================================
-- The 'sub' claim from the Zitadel ID token is the durable subject identifier.
-- We mirror the email locally for joins; Zitadel remains the source of truth.

CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    zitadel_subject TEXT UNIQUE NOT NULL,
    email           VARCHAR(255) UNIQUE NOT NULL,
    first_name      VARCHAR(100),
    last_name       VARCHAR(100),
    phone           VARCHAR(20),
    role            VARCHAR(50) NOT NULL CHECK (role IN ('admin', 'tenant')),
    is_active       BOOLEAN DEFAULT TRUE,
    created_at      TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- PROPERTIES
-- ============================================================

CREATE TABLE properties (
    id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id      UUID REFERENCES users(id) ON DELETE CASCADE,
    address      VARCHAR(500) NOT NULL,
    unit_number  VARCHAR(50),
    rent_amount  DECIMAL(10, 2) NOT NULL CHECK (rent_amount > 0),
    bedrooms     INTEGER,
    bathrooms    DECIMAL(3,1),
    description  TEXT,
    created_at   TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at   TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- TENANTS: linked to Stripe Customer + Subscription
-- ============================================================
-- stripe_subscription_id IS the auto-pay record. No separate auto_payments table.

CREATE TABLE tenants (
    id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id                 UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    first_name              VARCHAR(100) NOT NULL,
    last_name               VARCHAR(100) NOT NULL,
    phone                   VARCHAR(20),
    property_id             UUID REFERENCES properties(id) ON DELETE SET NULL,
    payment_due_day         INTEGER DEFAULT 1 CHECK (payment_due_day BETWEEN 1 AND 28),
    stripe_customer_id      VARCHAR(255) UNIQUE,
    stripe_subscription_id  VARCHAR(255) UNIQUE,
    created_at              TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at              TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- PAYMENT_METHODS: Stripe-only (card + us_bank_account/ACH)
-- ============================================================
-- Storage is a local pointer to the Stripe-side PaymentMethod. Stripe is the source of truth.
-- We keep last4/brand/bank_name for UI display so we don't have to round-trip to Stripe to render a list.

CREATE TABLE payment_methods (
    id                        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id                 UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    stripe_payment_method_id  VARCHAR(255) NOT NULL UNIQUE,
    type                      VARCHAR(50) NOT NULL CHECK (type IN ('card', 'us_bank_account')),
    last4                     VARCHAR(4),
    bank_name                 VARCHAR(255),
    card_brand                VARCHAR(50),
    is_default                BOOLEAN DEFAULT FALSE,
    created_at                TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at                TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (tenant_id, type, last4)
);

-- ============================================================
-- PAYMENTS: webhook-driven mirror of Stripe Invoices
-- ============================================================
-- Each row corresponds to one Stripe Invoice. Status mirrors invoice.status.
-- stripe_charge_id is filled on success and is the join key for ACH return events
-- (charge.failed fires 1-7 days after invoice.payment_succeeded for ACH bounces — T12 follow-up).

CREATE TABLE payments (
    id                         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id                  UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    property_id                UUID REFERENCES properties(id) ON DELETE SET NULL,
    stripe_invoice_id          VARCHAR(255) UNIQUE,
    stripe_payment_intent_id   VARCHAR(255),
    stripe_charge_id           VARCHAR(255),
    amount                     DECIMAL(10, 2) NOT NULL CHECK (amount > 0),
    status                     VARCHAR(50) NOT NULL CHECK (status IN ('open', 'processing', 'succeeded', 'failed', 'uncollectible', 'void')),
    payment_method_id          UUID REFERENCES payment_methods(id) ON DELETE SET NULL,
    due_date                   DATE NOT NULL,
    paid_at                    TIMESTAMPTZ,
    created_at                 TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at                 TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- STRIPE_EVENTS: webhook idempotency (T8)
-- ============================================================
-- Webhook handler inserts (event_id, type, payload) with ON CONFLICT DO NOTHING.
-- If the INSERT touches 0 rows, this event has been processed already and is skipped.

CREATE TABLE stripe_events (
    event_id     VARCHAR(255) PRIMARY KEY,
    event_type   VARCHAR(100) NOT NULL,
    received_at  TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    processed_at TIMESTAMPTZ,
    payload      JSONB
);

-- ============================================================
-- SYSTEM_SETTINGS: bootstrap flags, reconcile cursor
-- ============================================================
-- Holds the last_stripe_event_synced_at watermark for the reconcile script,
-- and a defense-in-depth admin_bootstrapped flag (Zitadel self-register is off,
-- but this is one extra guarantee).

CREATE TABLE system_settings (
    key         VARCHAR(100) PRIMARY KEY,
    value       JSONB NOT NULL,
    updated_at  TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- INDEXES
-- ============================================================

CREATE INDEX idx_users_zitadel_subject       ON users(zitadel_subject);
CREATE INDEX idx_users_email                  ON users(email);
CREATE INDEX idx_tenants_user_id              ON tenants(user_id);
CREATE INDEX idx_tenants_property_id          ON tenants(property_id);
CREATE INDEX idx_tenants_stripe_customer_id   ON tenants(stripe_customer_id);
CREATE INDEX idx_tenants_stripe_subscription  ON tenants(stripe_subscription_id);
CREATE INDEX idx_properties_user_id           ON properties(user_id);
CREATE INDEX idx_payment_methods_tenant_id    ON payment_methods(tenant_id);
CREATE INDEX idx_payment_methods_stripe_pm    ON payment_methods(stripe_payment_method_id);
CREATE INDEX idx_payments_tenant_id           ON payments(tenant_id);
CREATE INDEX idx_payments_property_id         ON payments(property_id);
CREATE INDEX idx_payments_stripe_invoice      ON payments(stripe_invoice_id);
CREATE INDEX idx_payments_status              ON payments(status);
CREATE INDEX idx_payments_due_date            ON payments(due_date);
CREATE INDEX idx_stripe_events_type_received  ON stripe_events(event_type, received_at DESC);

-- ============================================================
-- UPDATED_AT TRIGGERS
-- ============================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_users_updated_at           BEFORE UPDATE ON users           FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trg_properties_updated_at      BEFORE UPDATE ON properties      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trg_tenants_updated_at         BEFORE UPDATE ON tenants         FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trg_payment_methods_updated_at BEFORE UPDATE ON payment_methods FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trg_payments_updated_at        BEFORE UPDATE ON payments        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trg_system_settings_updated_at BEFORE UPDATE ON system_settings FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- SEED DATA
-- ============================================================

INSERT INTO system_settings (key, value) VALUES
    ('last_stripe_event_synced_at', to_jsonb(extract(epoch from now())::bigint)),
    ('admin_bootstrapped',           'false'::jsonb)
ON CONFLICT (key) DO NOTHING;
