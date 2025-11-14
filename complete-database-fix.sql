-- Complete database fix - Add only essential foreign key constraints
-- This script checks for column existence before adding constraints

DO $$
DECLARE
    constraint_exists boolean;
BEGIN
    -- 1. Fix tenants.user_id -> users.id (this is essential and exists)
    SELECT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'fk_tenants_user_id'
        AND table_name = 'tenants'
    ) INTO constraint_exists;

    IF NOT constraint_exists THEN
        ALTER TABLE tenants
        ADD CONSTRAINT fk_tenants_user_id
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
        RAISE NOTICE 'Added foreign key: tenants.user_id -> users.id';
    END IF;

    -- 2. Fix tenants.property_id -> properties.id (if property_id exists)
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'tenants' AND column_name = 'property_id'
    ) THEN
        SELECT EXISTS (
            SELECT 1 FROM information_schema.table_constraints
            WHERE constraint_name = 'fk_tenants_property_id'
            AND table_name = 'tenants'
        ) INTO constraint_exists;

        IF NOT constraint_exists THEN
            ALTER TABLE tenants
            ADD CONSTRAINT fk_tenants_property_id
            FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE SET NULL;
            RAISE NOTICE 'Added foreign key: tenants.property_id -> properties.id';
        END IF;
    END IF;

    RAISE NOTICE 'Database foreign key constraints have been fixed!';
    RAISE NOTICE 'The tenant creation and listing should now work properly.';
END $$;