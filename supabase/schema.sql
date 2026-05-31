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
-- TENANTS: pre-staged by admin; linked to a user on first Zitadel login
-- ============================================================
-- stripe_subscription_id IS the auto-pay record. No separate auto_payments table.
-- user_id is NULL until the tenant accepts the Zitadel invite and logs in for the
-- first time; the provisioning route links by matching tenants.email = users.email.

CREATE TABLE tenants (
    id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id                 UUID UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    email                   VARCHAR(255) UNIQUE NOT NULL,
    first_name              VARCHAR(100) NOT NULL,
    last_name               VARCHAR(100) NOT NULL,
    phone                   VARCHAR(20),
    property_id             UUID REFERENCES properties(id) ON DELETE SET NULL,
    payment_due_day         INTEGER DEFAULT 1 CHECK (payment_due_day BETWEEN 1 AND 28),
    stripe_customer_id      VARCHAR(255) UNIQUE,
    stripe_subscription_id  VARCHAR(255) UNIQUE,
    -- Tenant-controlled email notification toggles (tenant Settings page).
    notify_maintenance_replies BOOLEAN NOT NULL DEFAULT true,
    notify_payment_receipts    BOOLEAN NOT NULL DEFAULT true,
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
    -- Verification state. 'verified' is the default because:
    --   - Cards are always 'verified' on attach (Stripe handles auth via 3DS).
    --   - us_bank_account via Financial Connections is verified instantly.
    -- The 'pending_microdeposits' state applies only to manual-entry ACH
    -- accounts: tenant typed routing+account → Stripe sent 2 micro-deposits →
    -- tenant must come back and enter the amounts to verify. We stash the
    -- SetupIntent id so we can call stripe.setupIntents.verifyMicrodeposits
    -- when the tenant submits the amounts.
    verification_status       VARCHAR(50) NOT NULL DEFAULT 'verified'
                              CHECK (verification_status IN ('verified', 'pending_microdeposits', 'failed')),
    setup_intent_id           VARCHAR(255),
    created_at                TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at                TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    -- No (tenant_id, type, last4) UNIQUE: a tenant can legitimately have
    -- multiple bank accounts at the same institution that share a last4
    -- (e.g. checking + savings), AND Stripe test mode reuses the same
    -- last4 across test account numbers. The real uniqueness is
    -- enforced by stripe_payment_method_id (UNIQUE above).
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
    -- amount >= 0 (not > 0) so we can mirror $0 Stripe Invoices. Stripe
    -- legitimately creates $0 invoices for proration-less period starts,
    -- credit-note adjustments, and zero-amount invoice items. Filtering
    -- them out at the CHECK layer made the webhook handler silently fail
    -- (rejected by postgres, no error surfaced to logs).
    amount                     DECIMAL(10, 2) NOT NULL CHECK (amount >= 0),
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
CREATE INDEX idx_tenants_email                ON tenants(email);
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
-- PROVISIONING FUNCTION (atomic first-user-becomes-admin + tenant link)
-- ============================================================
-- Called by app/api/auth/provision (via lib/provision.ts) on the FIRST
-- login for a given Zitadel subject. Closes the race condition flagged by
-- the outside-voice review (blocker #2): two concurrent first-logins
-- would otherwise both observe an empty users table.
--
-- Mechanism: pg_advisory_xact_lock serializes the empty-check + insert
-- into a single critical section. The lock is released when the
-- transaction commits. Subsequent calls (after admin exists) acquire the
-- lock briefly but only do the insert path.
--
-- For tenants, also links the matching pre-staged tenants row (created
-- by admin) by email.

CREATE OR REPLACE FUNCTION provision_user_from_zitadel(
    p_zitadel_subject TEXT,
    p_email           TEXT,
    p_first_name      TEXT,
    p_last_name       TEXT,
    p_lock_key        BIGINT
)
-- OUT parameters renamed with `out_` prefix to avoid ambiguity with the
-- tenants.user_id and users.role columns inside the function body. Postgres
-- otherwise can't tell whether `WHERE user_id IS NULL` refers to the OUT
-- param or the column, and errors with `column reference "user_id" is
-- ambiguous`. The Supabase client unpacks the result by COLUMN NAME so
-- the .rpc() call still works after the rename; supabase-js maps
-- `out_user_id` -> data[0].out_user_id, so lib/provision.ts also gets
-- updated to read those names.
RETURNS TABLE (out_user_id UUID, out_role TEXT)
LANGUAGE plpgsql
AS $$
DECLARE
    v_existing_count INTEGER;
    v_role           TEXT;
    v_new_user_id    UUID;
BEGIN
    PERFORM pg_advisory_xact_lock(p_lock_key);

    -- Double-check existence under the lock (the auth.ts caller already
    -- fast-pathed this, but a race between fast-path and lock acquisition
    -- could still hit here).
    SELECT u.id, u.role INTO v_new_user_id, v_role
    FROM users u
    WHERE u.zitadel_subject = p_zitadel_subject;

    IF v_new_user_id IS NOT NULL THEN
        out_user_id := v_new_user_id;
        out_role    := v_role;
        RETURN NEXT;
        RETURN;
    END IF;

    -- Zitadel-migration safety net: a user with this email may already
    -- exist with a different zitadel_subject (e.g. we moved from
    -- auth.kainban.com to auth.getezpm.com; old subjects are dead).
    -- Without this branch the INSERT below would explode on the
    -- users.email UNIQUE constraint and lock the user out of their own
    -- account. Re-binding the existing row to the new subject preserves
    -- tenant linkage (via users.id) and lets them log in.
    --
    -- Trust model: email-as-identity is safe because Zitadel enforces
    -- email uniqueness within the org, and admins invite tenants by
    -- email. If you ever federate to a second IdP that issues different
    -- subjects for the same email, harden this check (e.g. require an
    -- admin to confirm the rebinding).
    SELECT u.id, u.role INTO v_new_user_id, v_role
    FROM users u
    WHERE LOWER(u.email) = LOWER(p_email);

    IF v_new_user_id IS NOT NULL THEN
        UPDATE users
           SET zitadel_subject = p_zitadel_subject,
               first_name      = COALESCE(p_first_name, first_name),
               last_name       = COALESCE(p_last_name, last_name)
         WHERE id = v_new_user_id;
        out_user_id := v_new_user_id;
        out_role    := v_role;
        RETURN NEXT;
        RETURN;
    END IF;

    -- First-user-becomes-admin
    SELECT COUNT(*) INTO v_existing_count FROM users;
    IF v_existing_count = 0 THEN
        v_role := 'admin';
    ELSE
        v_role := 'tenant';
    END IF;

    INSERT INTO users (zitadel_subject, email, first_name, last_name, role)
    VALUES (p_zitadel_subject, p_email, p_first_name, p_last_name, v_role)
    RETURNING id INTO v_new_user_id;

    -- Defense-in-depth: mark the bootstrap as done so any future
    -- provisioning logic can short-circuit the empty-check.
    UPDATE system_settings ss
       SET value = 'true'::jsonb
     WHERE ss.key = 'admin_bootstrapped'
       AND ss.value::text = 'false';

    -- If tenant, link to a pre-staged tenants row by email (admin creates
    -- these rows when inviting tenants via /admin/tenants/create).
    -- Columns explicitly qualified with the table alias to avoid any
    -- ambiguity with OUT parameters or local variables.
    IF v_role = 'tenant' THEN
        UPDATE tenants t
           SET user_id = v_new_user_id
         WHERE t.email = p_email
           AND t.user_id IS NULL;
        -- Note: it's OK if no row exists (e.g. an unrecognized email that
        -- somehow got through Zitadel's invite-only policy). The provisioning
        -- still succeeds; the user just has no tenant record to charge until
        -- admin creates one.
    END IF;

    out_user_id := v_new_user_id;
    out_role    := v_role;
    RETURN NEXT;
END;
$$;

-- ============================================================
-- MAINTENANCE REQUESTS  (Phase 1: report + photos + status)
-- ============================================================
-- A tenant raises a request; the landlord moves status. Photos live on a
-- mounted disk volume (see lib/storage.ts) and are served ONLY through an
-- ownership-checked route, never a public URL. The two-way "updates thread"
-- is Phase 2 (a separate maintenance_updates table) — not in this schema yet.

CREATE TABLE maintenance_requests (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    property_id UUID REFERENCES properties(id) ON DELETE SET NULL,
    title       VARCHAR(200) NOT NULL,
    description TEXT,
    category    VARCHAR(30)  NOT NULL DEFAULT 'other',
    priority    VARCHAR(10)  NOT NULL DEFAULT 'normal',
    status      VARCHAR(20)  NOT NULL DEFAULT 'open',
    -- Root post id of this request's Mattermost thread (set when the bot posts
    -- the initial message); status changes reply under it to keep one thread
    -- per request.
    mattermost_root_id TEXT,
    created_at  TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    resolved_at TIMESTAMPTZ,
    CONSTRAINT mr_category_check CHECK (category IN ('plumbing','electrical','appliance','hvac','other')),
    CONSTRAINT mr_priority_check CHECK (priority IN ('normal','urgent')),
    CONSTRAINT mr_status_check   CHECK (status   IN ('open','in_progress','resolved','cancelled'))
);
CREATE INDEX idx_mr_tenant ON maintenance_requests(tenant_id);
CREATE INDEX idx_mr_status ON maintenance_requests(status);

-- Photo/PDF attachments. file_path is RELATIVE to UPLOADS_DIR; file_name is
-- the original (display only). Stored on disk as <uuid>.<ext> by lib/storage.ts.
CREATE TABLE maintenance_attachments (
    id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    request_id       UUID NOT NULL REFERENCES maintenance_requests(id) ON DELETE CASCADE,
    file_path        TEXT NOT NULL,
    file_name        VARCHAR(255) NOT NULL,
    content_type     VARCHAR(100) NOT NULL,
    size_bytes       INTEGER NOT NULL,
    uploaded_by_role VARCHAR(10) NOT NULL,
    created_at       TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT ma_uploader_check CHECK (uploaded_by_role IN ('tenant','admin'))
);
CREATE INDEX idx_ma_request ON maintenance_attachments(request_id);

-- ============================================================
-- MAINTENANCE COMMENTS  (Phase 2: two-way updates thread)
-- ============================================================
-- Comments on a request from tenant or admin. Admin can attach photos to a
-- comment via maintenance_attachments.comment_id (added below).
CREATE TABLE maintenance_comments (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    request_id      UUID NOT NULL REFERENCES maintenance_requests(id) ON DELETE CASCADE,
    author_role     VARCHAR(10) NOT NULL,
    author_user_id  UUID REFERENCES users(id) ON DELETE SET NULL,
    body            TEXT NOT NULL,
    -- Set when this comment was mirrored IN from a Mattermost reply; dedupes
    -- the outgoing-webhook callback so a reply is never ingested twice.
    mattermost_post_id TEXT UNIQUE,
    created_at      TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT mc_author_check CHECK (author_role IN ('tenant','admin'))
);
CREATE INDEX idx_mc_request ON maintenance_comments(request_id);

-- Link a photo to a specific comment (NULL = belongs to the request itself).
ALTER TABLE maintenance_attachments
    ADD COLUMN comment_id UUID REFERENCES maintenance_comments(id) ON DELETE CASCADE;
CREATE INDEX idx_ma_comment ON maintenance_attachments(comment_id);

-- ============================================================
-- DOCUMENTS  (bidirectional per-tenant file sharing)
-- ============================================================
-- A per-tenant folder: both tenant and admin upload; both see all of that
-- tenant's documents (labeled by uploader). Files live under UPLOADS_DIR as
-- documents/<tenant_id>/<uuid>.<ext>, served only via an ownership-checked
-- route. Uploader deletes own; admin deletes any.
CREATE TABLE documents (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    category            VARCHAR(20) NOT NULL DEFAULT 'other',
    file_path           TEXT NOT NULL,
    file_name           VARCHAR(255) NOT NULL,
    content_type        VARCHAR(150) NOT NULL,
    size_bytes          INTEGER NOT NULL,
    uploaded_by_role    VARCHAR(10) NOT NULL,
    uploaded_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at          TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT doc_uploader_check CHECK (uploaded_by_role IN ('tenant','admin')),
    CONSTRAINT doc_category_check CHECK (category IN ('lease','insurance','id','income','notice','receipt','other'))
);
CREATE INDEX idx_doc_tenant ON documents(tenant_id);

-- ============================================================
-- ANNOUNCEMENTS  (admin → all tenants)
-- ============================================================
CREATE TABLE announcements (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title       VARCHAR(200) NOT NULL,
    body        TEXT NOT NULL,
    created_by  UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at  TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_ann_created ON announcements(created_at DESC);

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
CREATE TRIGGER trg_maintenance_requests_updated_at BEFORE UPDATE ON maintenance_requests FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trg_announcements_updated_at     BEFORE UPDATE ON announcements    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- SEED DATA
-- ============================================================

INSERT INTO system_settings (key, value) VALUES
    ('last_stripe_event_synced_at', to_jsonb(extract(epoch from now())::bigint)),
    ('admin_bootstrapped',           'false'::jsonb)
ON CONFLICT (key) DO NOTHING;
