#!/usr/bin/env node

// Manually save a Moov payment method to the database

require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Replace these with your actual values
const USER_EMAIL = 'info@interestingsoup.com'; // Your login email
const MOOV_ACCOUNT_ID = '80ee2d18-9a79-472a-89a5-956adc90ef7f';
const BANK_ACCOUNT_ID = 'ae2e69bf-8514-4a75-8eb1-1c32e357f43f';
const LAST_4 = '6789';

async function savePaymentMethod() {
  console.log('🚀 Saving payment method to database...\n');

  try {
    // First, find the tenant
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id')
      .eq('email', USER_EMAIL)
      .single();

    if (userError || !user) {
      console.error('❌ User not found:', userError);
      return;
    }

    const { data: tenant, error: tenantError } = await supabase
      .from('tenants')
      .select('id, moov_account_id')
      .eq('user_id', user.id)
      .single();

    if (tenantError || !tenant) {
      console.error('❌ Tenant not found:', tenantError);
      return;
    }

    console.log('Found tenant:', tenant.id);

    // Update tenant with Moov account ID if not set
    if (!tenant.moov_account_id) {
      console.log('Updating tenant with Moov account ID...');
      const { error: updateError } = await supabase
        .from('tenants')
        .update({ moov_account_id: MOOV_ACCOUNT_ID })
        .eq('id', tenant.id);

      if (updateError) {
        console.error('❌ Failed to update tenant:', updateError);
      } else {
        console.log('✅ Tenant updated with Moov account ID');
      }
    }

    // Check if payment method already exists
    const { data: existing } = await supabase
      .from('payment_methods')
      .select('*')
      .eq('tenant_id', tenant.id)
      .eq('moov_payment_method_id', BANK_ACCOUNT_ID)
      .single();

    if (existing) {
      console.log('Payment method already exists:', existing);
      
      // Update verification status
      const { error: updateError } = await supabase
        .from('payment_methods')
        .update({ is_verified: true })
        .eq('id', existing.id);

      if (!updateError) {
        console.log('✅ Payment method marked as verified');
      }
    } else {
      // Create new payment method
      const { data: paymentMethod, error: pmError } = await supabase
        .from('payment_methods')
        .insert({
          tenant_id: tenant.id,
          type: 'moov_ach',
          moov_payment_method_id: BANK_ACCOUNT_ID,
          last4: LAST_4,
          is_default: false,
          is_verified: true // Set to true since you verified it
        })
        .select()
        .single();

      if (pmError) {
        console.error('❌ Failed to save payment method:', pmError);
      } else {
        console.log('✅ Payment method saved:', paymentMethod);
      }
    }

    console.log('\n✅ Done! Check your payment methods page:');
    console.log('https://rent.qureshi.io/tenant/payment-methods');

  } catch (error) {
    console.error('❌ Error:', error);
  }
}

savePaymentMethod();
