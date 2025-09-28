-- Check what columns exist in each table
SELECT
    table_name,
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_schema = 'public'
    AND table_name IN ('users', 'tenants', 'properties', 'payment_methods', 'payments', 'auto_payments')
ORDER BY table_name, ordinal_position;