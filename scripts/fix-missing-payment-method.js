#!/usr/bin/env node

// Fix missing payment method from failed onboarding

require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// These are from your latest onboarding attempt
// You can update these with the values from your browser console
const BANK_ACCOUNT_ID = '72128310-0cb0-4ca5-867b-2e0559f55176'; // Get from browser console
const LAST_4 = '6789'; // Get from browser console

async function fixMissingPaymentMethod(email) {
  console.log('🔧 Fixing missing payment method...\n');

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
    console.log('Moov Account ID:', tenant.moov_account_id);

    if (!tenant.moov_account_id) {
      console.error('❌ Tenant has no Moov account ID!');
      console.log('Please provide the Moov account ID from your browser console');
      return;
    }

    // Check if we need to get bank account ID from user
    if (BANK_ACCOUNT_ID === 'YOUR_BANK_ACCOUNT_ID') {
      console.log('\n⚠️  Please update this script with your bank account details:');
      console.log('1. Open browser console on the onboarding page');
      console.log('2. Look for "Bank account created:" or "Resource created: bankAccount"');
      console.log('3. Copy the bankAccountID value');
      console.log('4. Update BANK_ACCOUNT_ID in this script');
      console.log('5. Also update LAST_4 with the last 4 digits');
      console.log('\nExample values from console:');
      console.log('bankAccountID: "ae2e69bf-8514-4a75-8eb1-1c32e357f43f"');
      console.log('lastFourAccountNumber: "6789"');
      return;
    }

    // Check if payment method already exists
    const { data: existing } = await supabase
      .from('payment_methods')
      .select('*')
      .eq('tenant_id', tenant.id)
      .eq('moov_payment_method_id', BANK_ACCOUNT_ID)
      .single();

    if (existing) {
      console.log('✅ Payment method already exists!');
      console.log('   Type:', existing.type);
      console.log('   Last 4:', existing.last4);
      console.log('   Verified:', existing.is_verified ? '✅' : '❌');
      return;
    }

    // Create the payment method
    console.log('\nCreating payment method...');
    const { data: paymentMethod, error: pmError } = await supabase
      .from('payment_methods')
      .insert({
        tenant_id: tenant.id,
        type: 'moov_ach',
        moov_payment_method_id: BANK_ACCOUNT_ID,
        last4: LAST_4,
        is_default: false,
        is_verified: false // Unverified by default
      })
      .select()
      .single();

    if (pmError) {
      console.error('❌ Failed to save payment method:', pmError);
    } else {
      console.log('✅ Payment method saved successfully!');
      console.log('   ID:', paymentMethod.id);
      console.log('   Type:', paymentMethod.type);
      console.log('   Last 4:', paymentMethod.last4);
      console.log('   Verified:', paymentMethod.is_verified ? '✅' : '❌ (needs verification)');
      console.log('\n✅ You should now see the payment method in your list!');
      console.log('Go to: https://rent.qureshi.io/tenant/payment-methods');
    }

  } catch (error) {
    console.error('❌ Error:', error);
  }
}

// Get email from command line or use default
const email = process.argv[2] || 'info@interestingsoup.com';
console.log('Email:', email);
console.log('Bank Account ID:', BANK_ACCOUNT_ID);
console.log('Last 4:', LAST_4);
console.log('');

fixMissingPaymentMethod(email);
