#!/usr/bin/env node

// This script runs SQL migrations using Supabase Management API
// You need a Supabase access token from: https://app.supabase.com/account/tokens

require('dotenv').config({ path: '.env.local' });

const SUPABASE_ACCESS_TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const SUPABASE_PROJECT_REF = process.env.SUPABASE_PROJECT_REF;

if (!SUPABASE_ACCESS_TOKEN || !SUPABASE_PROJECT_REF) {
  console.log('❌ Missing required environment variables\n');
  console.log('To run SQL programmatically, you need:');
  console.log('1. Go to: https://app.supabase.com/account/tokens');
  console.log('2. Generate a new access token');
  console.log('3. Get your project reference from your project URL');
  console.log('   (e.g., if URL is https://abcdefgh.supabase.co, ref is "abcdefgh")');
  console.log('4. Add to your .env.local:');
  console.log('   SUPABASE_ACCESS_TOKEN=your_token_here');
  console.log('   SUPABASE_PROJECT_REF=your_project_ref_here\n');
  console.log('Alternative: Use the Supabase CLI');
  console.log('1. Install: npm install -g supabase');
  console.log('2. Login: supabase login');
  console.log('3. Run: supabase db execute --project-ref YOUR_REF --file supabase/add_bank_verification_status.sql\n');
  process.exit(1);
}

async function runMigration() {
  const sql = `
-- Add column if it doesn't exist
ALTER TABLE payment_methods 
ADD COLUMN IF NOT EXISTS is_verified BOOLEAN DEFAULT FALSE;

-- Update existing cards to be verified
UPDATE payment_methods 
SET is_verified = TRUE 
WHERE type = 'card';

-- Force schema cache refresh
NOTIFY pgrst, 'reload schema';
`;

  console.log('🚀 Running SQL migration via Supabase Management API...\n');

  try {
    const response = await fetch(
      `https://api.supabase.com/v1/projects/${SUPABASE_PROJECT_REF}/database/query`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${SUPABASE_ACCESS_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query: sql })
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`API Error: ${response.status} - ${error}`);
    }

    const result = await response.json();
    console.log('✅ Migration executed successfully!');
    console.log('Result:', result);
    console.log('\n✅ The is_verified column has been added and schema cache refreshed.');
    console.log('You can now redeploy your app and test the verification flow!');

  } catch (error) {
    console.error('❌ Failed to run migration:', error.message);
    console.error('\nPlease run the SQL manually in your Supabase dashboard.');
  }
}

runMigration();
