-- Fix missing foreign key relationships (conservative version)
-- Only add constraints for columns that definitely exist based on original schema

-- 1. Add foreign key constraint for tenants.user_id -> users.id (this definitely exists)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'fk_tenants_user_id'
        AND table_name = 'tenants'
    ) THEN
        ALTER TABLE tenants
        ADD CONSTRAINT fk_tenants_user_id
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
    END IF;
END $$;

-- 2. Add foreign key constraint for tenants.property_id -> properties.id (if property_id exists)
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'tenants'
        AND column_name = 'property_id'
    ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'fk_tenants_property_id'
        AND table_name = 'tenants'
    ) THEN
        ALTER TABLE tenants
        ADD CONSTRAINT fk_tenants_property_id
        FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE SET NULL;
    END IF;
END $$;