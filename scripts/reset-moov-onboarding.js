#!/usr/bin/env node

// Reset Moov onboarding for testing - clears all Moov data

require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function resetMoovOnboarding(email) {
  console.log('🔄 Resetting Moov onboarding for testing...\n');
  console.log('This will:');
  console.log('1. Clear Moov account ID from tenant');
  console.log('2. Delete all Moov payment methods');
  console.log('3. Allow you to start fresh\n');

  try {
    // Find the user
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id')
      .eq('email', email)
      .single();

    if (userError || !user) {
      console.error('❌ User not found:', userError);
      return;
    }

    console.log('Found user:', user.id);

    // Find the tenant
    const { data: tenant, error: tenantError } = await supabase
      .from('tenants')
      .select('*')
      .eq('user_id', user.id)
      .single();

    if (tenantError || !tenant) {
      console.error('❌ Tenant not found:', tenantError);
      return;
    }

    console.log('Found tenant:', tenant.id);
    console.log('Current Moov account ID:', tenant.moov_account_id || 'None');

    // Step 1: Delete all Moov payment methods
    console.log('\n📝 Step 1: Deleting Moov payment methods...');
    const { data: deletedMethods, error: deleteError } = await supabase
      .from('payment_methods')
      .delete()
      .eq('tenant_id', tenant.id)
      .eq('type', 'moov_ach')
      .select();

    if (deleteError) {
      console.error('Error deleting payment methods:', deleteError);
    } else {
      console.log(`✅ Deleted ${deletedMethods?.length || 0} Moov payment methods`);
    }

    // Step 2: Clear Moov account ID from tenant
    console.log('\n📝 Step 2: Clearing Moov account ID from tenant...');
    const { error: updateError } = await supabase
      .from('tenants')
      .update({ moov_account_id: null })
      .eq('id', tenant.id);

    if (updateError) {
      console.error('❌ Error updating tenant:', updateError);
    } else {
      console.log('✅ Cleared Moov account ID from tenant');
    }

    // Step 3: List remaining payment methods
    console.log('\n📝 Step 3: Checking remaining payment methods...');
    const { data: remainingMethods } = await supabase
      .from('payment_methods')
      .select('*')
      .eq('tenant_id', tenant.id);

    console.log(`Remaining payment methods: ${remainingMethods?.length || 0}`);
    if (remainingMethods && remainingMethods.length > 0) {
      remainingMethods.forEach(method => {
        console.log(`  - ${method.type}: ****${method.last4}`);
      });
    }

    console.log('\n' + '='.repeat(50));
    console.log('✅ RESET COMPLETE!');
    console.log('='.repeat(50));
    console.log('\nYou can now test the flow again:');
    console.log('1. Go to: https://rent.qureshi.io/tenant/payment-methods');
    console.log('2. Click "Add New Payment Method"');
    console.log('3. Select "Bank Account (ACH)"');
    console.log('4. Complete the Moov onboarding');
    console.log('\n💡 Tips for testing:');
    console.log('- Use different test bank account numbers each time');
    console.log('- Run: node scripts/generate-test-account.js');
    console.log('- Or use: 110000000 / 000123456789');
    console.log('- For micro-deposits in sandbox, always use: 0.00 / 0.00');

  } catch (error) {
    console.error('❌ Error:', error);
  }
}

// Get email from command line or use default
const email = process.argv[2] || 'info@interestingsoup.com';

console.log('Email:', email);
console.log('');

// Confirm before proceeding
const readline = require('readline');
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

rl.question('⚠️  This will delete all Moov payment methods. Continue? (y/n): ', (answer) => {
  if (answer.toLowerCase() === 'y') {
    resetMoovOnboarding(email).then(() => {
      rl.close();
    });
  } else {
    console.log('Cancelled.');
    rl.close();
  }
});
