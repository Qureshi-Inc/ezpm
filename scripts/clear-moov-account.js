#!/usr/bin/env node

// This script helps you clear the Moov account from your database
// so you can start fresh with the onboarding process

require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function clearMoovAccount(email) {
  try {
    // Find the user by email
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id')
      .eq('email', email)
      .single();
    
    if (userError) {
      console.error('Error finding user:', userError);
      return;
    }
    
    if (!user) {
      console.log('User not found');
      return;
    }
    
    // Find tenants for this user
    const { data: tenants, error: tenantError } = await supabase
      .from('tenants')
      .select('id, moov_account_id')
      .eq('user_id', user.id);
    
    if (tenantError) {
      console.error('Error finding tenants:', tenantError);
      return;
    }
    
    // Clear Moov account IDs
    for (const tenant of tenants) {
      if (tenant.moov_account_id) {
        console.log(`Clearing Moov account ${tenant.moov_account_id} from tenant ${tenant.id}`);
        
        const { error: updateError } = await supabase
          .from('tenants')
          .update({ moov_account_id: null })
          .eq('id', tenant.id);
        
        if (updateError) {
          console.error('Error updating tenant:', updateError);
        } else {
          console.log('✅ Successfully cleared Moov account');
        }
      }
    }
    
    console.log('\nYou can now go through the onboarding process again with the correct capabilities.');
    
  } catch (error) {
    console.error('Error:', error);
  }
}

// Replace with your email
const email = 'info@interestingsoup.com';
clearMoovAccount(email);
