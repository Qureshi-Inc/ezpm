#!/usr/bin/env node

// Check what payment methods exist in the database

require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkPaymentMethods(email) {
  console.log('🔍 Checking payment methods and tenant status...\n');

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

    console.log('User ID:', user.id);

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

    console.log('\n📋 Tenant Info:');
    console.log('- Tenant ID:', tenant.id);
    console.log('- Name:', tenant.first_name, tenant.last_name);
    console.log('- Moov Account ID:', tenant.moov_account_id || '❌ NOT SET');

    // Get all payment methods
    const { data: paymentMethods, error: pmError } = await supabase
      .from('payment_methods')
      .select('*')
      .eq('tenant_id', tenant.id)
      .order('created_at', { ascending: false });

    if (pmError) {
      console.error('Error fetching payment methods:', pmError);
      return;
    }

    console.log('\n💳 Payment Methods:', paymentMethods?.length || 0);
    
    if (paymentMethods && paymentMethods.length > 0) {
      paymentMethods.forEach((pm, index) => {
        console.log(`\n${index + 1}. ${pm.type} - ****${pm.last4}`);
        console.log('   ID:', pm.id);
        console.log('   Moov Payment Method ID:', pm.moov_payment_method_id || 'N/A');
        console.log('   Verified:', pm.is_verified === true ? '✅' : pm.is_verified === false ? '❌' : 'N/A');
        console.log('   Created:', new Date(pm.created_at).toLocaleString());
      });
    } else {
      console.log('   No payment methods found');
    }

    // Check if is_verified column exists
    console.log('\n🔧 Database Schema Check:');
    const { data: testQuery, error: testError } = await supabase
      .from('payment_methods')
      .select('id, is_verified')
      .limit(1);

    if (testError?.message?.includes('column "is_verified" does not exist')) {
      console.log('❌ is_verified column does NOT exist - migration needed!');
      console.log('   Run the SQL migration in Supabase');
    } else {
      console.log('✅ is_verified column exists');
    }

  } catch (error) {
    console.error('❌ Error:', error);
  }
}

// Get email from command line or use default
const email = process.argv[2] || 'info@interestingsoup.com';
console.log('Email:', email);

checkPaymentMethods(email);
