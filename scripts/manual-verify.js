#!/usr/bin/env node

// Manual script to initiate and complete micro-deposit verification

require('dotenv').config({ path: '.env.local' });

const MOOV_DOMAIN = process.env.MOOV_DOMAIN || 'https://api.moov.io';
const MOOV_PUBLIC_KEY = process.env.MOOV_PUBLIC_KEY;
const MOOV_SECRET_KEY = process.env.MOOV_SECRET_KEY;

// Replace these with your actual values from the console
const ACCOUNT_ID = '80ee2d18-9a79-472a-89a5-956adc90ef7f';
const BANK_ACCOUNT_ID = 'ae2e69bf-8514-4a75-8eb1-1c32e357f43f';

async function getAuthHeader() {
  const credentials = Buffer.from(`${MOOV_PUBLIC_KEY}:${MOOV_SECRET_KEY}`).toString('base64');
  return `Basic ${credentials}`;
}

async function initiateMicroDeposits() {
  console.log('🚀 Initiating micro-deposits...\n');
  
  const authHeader = await getAuthHeader();
  
  try {
    // Step 1: Initiate micro-deposits
    console.log('Step 1: Initiating micro-deposits...');
    const initiateResponse = await fetch(
      `${MOOV_DOMAIN}/accounts/${ACCOUNT_ID}/bank-accounts/${BANK_ACCOUNT_ID}/micro-deposits`,
      {
        method: 'POST',
        headers: {
          'Authorization': authHeader,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({})
      }
    );

    if (!initiateResponse.ok) {
      const error = await initiateResponse.text();
      console.error('Failed to initiate:', initiateResponse.status, error);
      
      if (initiateResponse.status === 409) {
        console.log('\n✅ Micro-deposits already initiated! Proceeding to verification...');
      } else {
        throw new Error(`Failed to initiate: ${error}`);
      }
    } else {
      const result = await initiateResponse.json();
      console.log('✅ Micro-deposits initiated:', result);
    }

    // Step 2: In sandbox, we can immediately verify with 0, 0
    console.log('\nStep 2: Completing verification with test amounts (0, 0)...');
    
    const verifyResponse = await fetch(
      `${MOOV_DOMAIN}/accounts/${ACCOUNT_ID}/bank-accounts/${BANK_ACCOUNT_ID}/micro-deposits`,
      {
        method: 'PUT',
        headers: {
          'Authorization': authHeader,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          amounts: [0, 0] // Sandbox test amounts
        })
      }
    );

    if (!verifyResponse.ok) {
      const error = await verifyResponse.text();
      console.error('Failed to verify:', verifyResponse.status, error);
      throw new Error(`Failed to verify: ${error}`);
    }

    const verifyResult = await verifyResponse.json();
    console.log('✅ Bank account verified successfully!', verifyResult);
    
    console.log('\n🎉 Success! Your bank account is now verified.');
    console.log('You can now use it for ACH payments.');
    
    // Step 3: Manually save to database
    console.log('\nStep 3: Saving to your database...');
    console.log('Go to your payment methods page to see the verified account:');
    console.log('https://rent.qureshi.io/tenant/payment-methods');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.log('\nTroubleshooting:');
    console.log('1. Make sure you have the correct account and bank account IDs');
    console.log('2. Verify your Moov API credentials are correct');
    console.log('3. Check if you\'re using sandbox credentials');
  }
}

// Show current configuration
console.log('Configuration:');
console.log('- Moov Domain:', MOOV_DOMAIN);
console.log('- Account ID:', ACCOUNT_ID);
console.log('- Bank Account ID:', BANK_ACCOUNT_ID);
console.log('');

initiateMicroDeposits();
