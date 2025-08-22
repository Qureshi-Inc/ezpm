#!/usr/bin/env node

require('dotenv').config({ path: '.env.local' });

const MOOV_DOMAIN = process.env.MOOV_DOMAIN || 'https://api.moov.io';
const MOOV_PUBLIC_KEY = process.env.MOOV_PUBLIC_KEY;
const MOOV_SECRET_KEY = process.env.MOOV_SECRET_KEY;

// The new account to check
const ACCOUNT_ID = '88df470d-80f3-4a25-bf62-fbb018cfaba0';

async function getAccessToken() {
  const response = await fetch(`${MOOV_DOMAIN}/oauth2/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: MOOV_PUBLIC_KEY,
      client_secret: MOOV_SECRET_KEY,
      scope: `/accounts/${ACCOUNT_ID}/capabilities.read /accounts/${ACCOUNT_ID}/profile.read`
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to get access token: ${error}`);
  }

  const data = await response.json();
  return data.access_token;
}

async function checkAccountCapabilities() {
  try {
    console.log('Getting access token...');
    const token = await getAccessToken();
    
    // Get account details
    console.log('\n📋 Checking account details...');
    const accountResponse = await fetch(`${MOOV_DOMAIN}/accounts/${ACCOUNT_ID}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    if (accountResponse.ok) {
      const account = await accountResponse.json();
      console.log('Account ID:', account.accountID);
      console.log('Display Name:', account.displayName);
      console.log('Account Type:', account.accountType);
      console.log('Mode:', account.mode);
      console.log('Created:', account.createdOn);
    }
    
    // Check capabilities
    console.log('\n🔧 Checking capabilities...');
    const capabilitiesResponse = await fetch(`${MOOV_DOMAIN}/accounts/${ACCOUNT_ID}/capabilities`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    if (!capabilitiesResponse.ok) {
      const error = await capabilitiesResponse.text();
      console.error('Failed to get capabilities:', capabilitiesResponse.status, error);
      return;
    }
    
    const capabilities = await capabilitiesResponse.json();
    console.log('\nCapabilities found:');
    
    const requiredForMicroDeposits = ['transfers', 'send-funds', 'collect-funds', 'wallet'];
    
    capabilities.forEach(cap => {
      const isRequired = requiredForMicroDeposits.includes(cap.capability);
      const status = cap.status === 'enabled' ? '✅' : cap.status === 'pending' ? '⏳' : '❌';
      const required = isRequired ? '(REQUIRED for micro-deposits)' : '';
      console.log(`  ${status} ${cap.capability}: ${cap.status} ${required}`);
      
      if (cap.requirements && cap.requirements.length > 0) {
        console.log(`      Requirements: ${cap.requirements.join(', ')}`);
      }
      if (cap.disabledReason) {
        console.log(`      Disabled reason: ${cap.disabledReason}`);
      }
    });
    
    // Check if collect-funds is missing or not enabled
    const collectFunds = capabilities.find(c => c.capability === 'collect-funds');
    if (!collectFunds) {
      console.log('\n❌ PROBLEM: collect-funds capability is NOT requested!');
      console.log('This capability is required for micro-deposits to work.');
    } else if (collectFunds.status !== 'enabled') {
      console.log(`\n⚠️  PROBLEM: collect-funds is ${collectFunds.status}, not enabled!`);
      if (collectFunds.requirements && collectFunds.requirements.length > 0) {
        console.log('Missing requirements:', collectFunds.requirements.join(', '));
      }
    }
    
  } catch (error) {
    console.error('Error:', error);
  }
}

checkAccountCapabilities();
