#!/bin/bash

# This script runs the migration using Supabase CLI
# Requires: npm install -g supabase

echo "🚀 Running database migration using Supabase CLI..."
echo ""

# Check if supabase CLI is installed
if ! command -v supabase &> /dev/null; then
    echo "❌ Supabase CLI not found!"
    echo ""
    echo "To install:"
    echo "  npm install -g supabase"
    echo ""
    echo "Then login:"
    echo "  supabase login"
    exit 1
fi

# Get project ref from user
echo "Enter your Supabase project reference"
echo "(Found in your project URL, e.g., 'abcdefgh' from https://abcdefgh.supabase.co):"
read -r PROJECT_REF

if [ -z "$PROJECT_REF" ]; then
    echo "❌ Project reference is required"
    exit 1
fi

# Create temporary SQL file
cat > /tmp/migration.sql << 'EOF'
-- Add column if it doesn't exist
ALTER TABLE payment_methods 
ADD COLUMN IF NOT EXISTS is_verified BOOLEAN DEFAULT FALSE;

-- Update existing cards to be verified
UPDATE payment_methods 
SET is_verified = TRUE 
WHERE type = 'card';

-- Force schema cache refresh
NOTIFY pgrst, 'reload schema';
EOF

echo ""
echo "Running migration..."
supabase db execute --project-ref "$PROJECT_REF" --file /tmp/migration.sql

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Migration completed successfully!"
    echo "The is_verified column has been added and schema cache refreshed."
    echo "You can now redeploy your app!"
    rm /tmp/migration.sql
else
    echo ""
    echo "❌ Migration failed. Please run the SQL manually in Supabase dashboard."
    rm /tmp/migration.sql
    exit 1
fi
