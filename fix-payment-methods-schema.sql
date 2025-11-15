-- Fix payment_methods table schema issues
-- Run this in your Supabase SQL editor

-- Check current schema
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'payment_methods'
AND table_schema = 'public'
ORDER BY ordinal_position;

-- Add missing columns if they don't exist
DO $$
BEGIN
    -- Add moov_payment_method_id if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'payment_methods'
        AND column_name = 'moov_payment_method_id'
        AND table_schema = 'public'
    ) THEN
        ALTER TABLE payment_methods ADD COLUMN moov_payment_method_id text;
    END IF;

    -- Add last4 if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'payment_methods'
        AND column_name = 'last4'
        AND table_schema = 'public'
    ) THEN
        ALTER TABLE payment_methods ADD COLUMN last4 text;
    END IF;

    -- Add tenant_id if it doesn't exist (for easier tenant-based queries)
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'payment_methods'
        AND column_name = 'tenant_id'
        AND table_schema = 'public'
    ) THEN
        ALTER TABLE payment_methods ADD COLUMN tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE;
    END IF;

    -- Add bank_name if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'payment_methods'
        AND column_name = 'bank_name'
        AND table_schema = 'public'
    ) THEN
        ALTER TABLE payment_methods ADD COLUMN bank_name text;
    END IF;

    -- Add provider if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'payment_methods'
        AND column_name = 'provider'
        AND table_schema = 'public'
    ) THEN
        ALTER TABLE payment_methods ADD COLUMN provider text;
    END IF;

    -- Add provider_payment_method_id if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'payment_methods'
        AND column_name = 'provider_payment_method_id'
        AND table_schema = 'public'
    ) THEN
        ALTER TABLE payment_methods ADD COLUMN provider_payment_method_id text;
    END IF;
END $$;

-- Show final schema
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'payment_methods'
AND table_schema = 'public'
ORDER BY ordinal_position;