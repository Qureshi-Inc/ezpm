#!/usr/bin/env node

// Update tenant with Moov account ID if missing

require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function updateTenantMoovAccount(email, moovAccountId) {
  console.log('🚀 Updating tenant with Moov account ID...\n');

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

    // Update tenant
    const { data: tenant, error: updateError } = await supabase
      .from('tenants')
      .update({ moov_account_id: moovAccountId })
      .eq('user_id', user.id)
      .select()
      .single();

    if (updateError) {
      console.error('❌ Failed to update tenant:', updateError);
    } else {
      console.log('✅ Tenant updated successfully:', tenant);
    }

  } catch (error) {
    console.error('❌ Error:', error);
  }
}

// Get arguments from command line or use defaults
const email = process.argv[2] || 'info@interestingsoup.com';
const moovAccountId = process.argv[3] || '80ee2d18-9a79-472a-89a5-956adc90ef7f';

console.log('Email:', email);
console.log('Moov Account ID:', moovAccountId);
console.log('');

updateTenantMoovAccount(email, moovAccountId);
