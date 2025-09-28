-- Fix missing foreign key relationships in the database

-- Add foreign key constraint for tenants.user_id -> users.id
ALTER TABLE tenants
ADD CONSTRAINT fk_tenants_user_id
FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

-- Add foreign key constraint for tenants.property_id -> properties.id
ALTER TABLE tenants
ADD CONSTRAINT fk_tenants_property_id
FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE SET NULL;

-- Add foreign key constraint for payment_methods.tenant_id -> tenants.id
ALTER TABLE payment_methods
ADD CONSTRAINT fk_payment_methods_tenant_id
FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;

-- Add foreign key constraint for payments.tenant_id -> tenants.id
ALTER TABLE payments
ADD CONSTRAINT fk_payments_tenant_id
FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;

-- Add foreign key constraint for payments.property_id -> properties.id
ALTER TABLE payments
ADD CONSTRAINT fk_payments_property_id
FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE;

-- Add foreign key constraint for payments.payment_method_id -> payment_methods.id
ALTER TABLE payments
ADD CONSTRAINT fk_payments_payment_method_id
FOREIGN KEY (payment_method_id) REFERENCES payment_methods(id) ON DELETE SET NULL;

-- Add foreign key constraint for auto_payments.tenant_id -> tenants.id
ALTER TABLE auto_payments
ADD CONSTRAINT fk_auto_payments_tenant_id
FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;

-- Add foreign key constraint for auto_payments.payment_method_id -> payment_methods.id
ALTER TABLE auto_payments
ADD CONSTRAINT fk_auto_payments_payment_method_id
FOREIGN KEY (payment_method_id) REFERENCES payment_methods(id) ON DELETE CASCADE;