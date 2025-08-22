#!/usr/bin/env node

require('dotenv').config({ path: '.env.local' });

const MOOV_DOMAIN = process.env.MOOV_DOMAIN || 'https://api.moov.io';
const MOOV_PUBLIC_KEY = process.env.MOOV_PUBLIC_KEY;
const MOOV_SECRET_KEY = process.env.MOOV_SECRET_KEY;

// The account that needs the capability
const ACCOUNT_ID = 'ec09395f-5e19-465a-927d-79e3b2243393';

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
      scope: `/accounts/${ACCOUNT_ID}/capabilities.write /accounts/${ACCOUNT_ID}/capabilities.read`
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to get access token: ${error}`);
  }

  const data = await response.json();
  return data.access_token;
}

async function requestCollectFunds() {
  try {
    console.log('Getting access token...');
    const token = await getAccessToken();
    
    console.log('Requesting collect-funds capability...');
    const response = await fetch(`${MOOV_DOMAIN}/accounts/${ACCOUNT_ID}/capabilities`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        capabilities: ['collect-funds']
      })
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('Failed to request capability:', response.status, error);
      return;
    }

    const result = await response.json();
    console.log('✅ Successfully requested collect-funds capability!');
    console.log('Result:', JSON.stringify(result, null, 2));
    
    // Check current capabilities
    console.log('\nChecking current capabilities...');
    const capabilitiesResponse = await fetch(`${MOOV_DOMAIN}/accounts/${ACCOUNT_ID}/capabilities`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    if (capabilitiesResponse.ok) {
      const capabilities = await capabilitiesResponse.json();
      console.log('Current capabilities:', JSON.stringify(capabilities, null, 2));
    }
    
  } catch (error) {
    console.error('Error:', error);
  }
}

requestCollectFunds();
