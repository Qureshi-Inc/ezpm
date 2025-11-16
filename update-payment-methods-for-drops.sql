-- Update payment_methods table to support Moov Drops additional fields
-- Run this in your Supabase SQL editor

-- Add additional fields that Moov Drops might provide
DO $$
BEGIN
    -- Add last_four as alias for last4 (some systems use different names)
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'payment_methods'
        AND column_name = 'last_four'
        AND table_schema = 'public'
    ) THEN
        ALTER TABLE payment_methods ADD COLUMN last_four text;
    END IF;

    -- Add is_verified flag for payment method verification status
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'payment_methods'
        AND column_name = 'is_verified'
        AND table_schema = 'public'
    ) THEN
        ALTER TABLE payment_methods ADD COLUMN is_verified boolean DEFAULT false;
    END IF;

    -- Add is_active flag
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'payment_methods'
        AND column_name = 'is_active'
        AND table_schema = 'public'
    ) THEN
        ALTER TABLE payment_methods ADD COLUMN is_active boolean DEFAULT true;
    END IF;

    -- Ensure status column exists with proper constraints
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'payment_methods'
        AND column_name = 'status'
        AND table_schema = 'public'
    ) THEN
        ALTER TABLE payment_methods ADD COLUMN status text DEFAULT 'pending'
            CHECK (status IN ('pending', 'verified', 'failed', 'disabled'));
    END IF;
END $$;

-- Show updated schema
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'payment_methods'
AND table_schema = 'public'
ORDER BY ordinal_position;