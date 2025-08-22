#!/usr/bin/env node

// This script runs the database migration to add the is_verified field

require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase credentials in .env.local');
  console.error('Make sure you have NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY set');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function runMigration() {
  console.log('🚀 Checking database and attempting migration...\n');

  try {
    // Test if the column exists by trying to query it
    console.log('Checking if is_verified column exists...');
    const { data: testQuery, error: testError } = await supabase
      .from('payment_methods')
      .select('id, is_verified')
      .limit(1);

    // Check for various error messages that indicate the column doesn't exist
    const columnDoesNotExist = testError && (
      testError.message?.includes('column "is_verified" does not exist') ||
      testError.message?.includes("Could not find the 'is_verified' column")
    );

    if (columnDoesNotExist) {
      // Column doesn't exist - need to add it
      console.log('❌ Column does not exist yet.');
      console.log('\nSupabase doesn\'t allow DDL operations via the client for security.');
      console.log('Please run the following SQL in your Supabase dashboard:\n');
      console.log('1. Go to: https://app.supabase.com/project/YOUR_PROJECT/sql/new');
      console.log('2. Paste and run this SQL:\n');
      console.log('--- COPY FROM HERE ---');
      console.log(`-- Add verification status for bank accounts
ALTER TABLE payment_methods 
ADD COLUMN is_verified BOOLEAN DEFAULT FALSE;

-- Set all existing card payment methods as verified
UPDATE payment_methods 
SET is_verified = TRUE 
WHERE type = 'card';

-- Moov ACH accounts will be FALSE by default until verified`);
      console.log('--- COPY TO HERE ---\n');
      console.log('3. Click "Run" to execute the migration\n');
      return;
    }

    // Column exists! Let's update any cards that aren't marked as verified
    console.log('✅ Column is_verified already exists!');
    
    // Update existing card payment methods to be verified
    console.log('Ensuring all card payment methods are marked as verified...');
    const { data: updated, error: updateError } = await supabase
      .from('payment_methods')
      .update({ is_verified: true })
      .eq('type', 'card')
      .is('is_verified', false)
      .select();

    if (updateError) {
      // Check if it's a schema cache issue
      if (updateError.message?.includes("Could not find the 'is_verified' column")) {
        console.log('⚠️  Schema cache needs refresh. The column was just added.');
        console.log('Please wait a moment for Supabase to refresh its cache, then redeploy your app.');
      } else {
        console.error('Error updating card payment methods:', updateError);
      }
    } else if (updated && updated.length > 0) {
      console.log(`✅ Updated ${updated.length} card payment methods to verified`);
    } else {
      console.log('✅ All card payment methods already marked as verified');
    }

    // Check status of Moov ACH methods
    const { data: moovMethods, error: moovError } = await supabase
      .from('payment_methods')
      .select('*')
      .eq('type', 'moov_ach');

    if (!moovError && moovMethods) {
      console.log(`\n📊 Status Report:`);
      console.log(`- Total Moov ACH payment methods: ${moovMethods.length}`);
      
      const verified = moovMethods.filter(m => m.is_verified);
      const unverified = moovMethods.filter(m => !m.is_verified);
      
      if (verified.length > 0) {
        console.log(`- Verified: ${verified.length}`);
      }
      if (unverified.length > 0) {
        console.log(`- Awaiting verification: ${unverified.length}`);
        console.log('  (These need micro-deposit verification)');
      }
    }

    console.log('\n✅ Database check complete!');

  } catch (error) {
    console.error('❌ Error:', error);
    console.error('\nIf you see a connection error, check your .env.local file for:');
    console.error('- NEXT_PUBLIC_SUPABASE_URL');
    console.error('- SUPABASE_SERVICE_ROLE_KEY');
  }
}

runMigration();
