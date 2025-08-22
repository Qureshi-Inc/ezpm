#!/usr/bin/env node

require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkMoovAccounts() {
  try {
    // Get all tenants with Moov accounts
    const { data: tenants, error } = await supabase
      .from('tenants')
      .select('id, first_name, last_name, moov_account_id, created_at')
      .not('moov_account_id', 'is', null)
      .order('created_at', { ascending: false });
    
    if (error) {
      console.error('Error fetching tenants:', error);
      return;
    }
    
    console.log('Tenants with Moov accounts:\n');
    tenants.forEach(tenant => {
      console.log(`Tenant: ${tenant.first_name} ${tenant.last_name}`);
      console.log(`  ID: ${tenant.id}`);
      console.log(`  Moov Account: ${tenant.moov_account_id}`);
      console.log(`  Created: ${tenant.created_at}`);
      console.log('');
    });
    
    // Check for the latest account
    const latestAccount = '88df470d-80f3-4a25-bf62-fbb018cfaba0';
    const hasLatest = tenants.some(t => t.moov_account_id === latestAccount);
    
    if (!hasLatest) {
      console.log(`⚠️  The latest account ${latestAccount} is NOT saved in the database!`);
      console.log('This means the account was created but not linked to your tenant.');
      console.log('\nSolution: The /api/tenant/moov-account endpoint might be failing.');
    } else {
      console.log(`✅ The latest account ${latestAccount} is saved in the database.`);
    }
    
  } catch (error) {
    console.error('Error:', error);
  }
}

checkMoovAccounts();
