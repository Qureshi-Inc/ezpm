#!/usr/bin/env node

/**
 * Test different authentication approaches with Moov
 */

require('dotenv').config({ path: '.env.local' })

const MOOV_DOMAIN = process.env.MOOV_DOMAIN || 'https://api.moov.io'
const MOOV_ACCOUNT_ID = process.env.MOOV_ACCOUNT_ID
const MOOV_PUBLIC_KEY = process.env.MOOV_PUBLIC_KEY
const MOOV_SECRET_KEY = process.env.MOOV_SECRET_KEY

console.log('🔐 Moov Authentication Test')
console.log('=' .repeat(50))
console.log('\nConfiguration:')
console.log(`  Domain: ${MOOV_DOMAIN}`)
console.log(`  Account ID: ${MOOV_ACCOUNT_ID}`)
console.log(`  Public Key: ***${MOOV_PUBLIC_KEY?.slice(-4)}`)
console.log(`  Secret Key: ***${MOOV_SECRET_KEY?.slice(-4)}`)

async function testAuth(description, tokenParams) {
  console.log(`\n${description}`)
  console.log('  Token params:', JSON.stringify(tokenParams, null, 2))
  
  try {
    // Get token
    const tokenResponse = await fetch(`${MOOV_DOMAIN}/oauth2/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams(tokenParams)
    })
    
    console.log(`  Token response: ${tokenResponse.status}`)
    
    if (!tokenResponse.ok) {
      const error = await tokenResponse.text()
      console.log(`  Token error: ${error}`)
      return
    }
    
    const tokenData = await tokenResponse.json()
    console.log(`  ✅ Token obtained`)
    console.log(`  Scopes granted: ${tokenData.scope}`)
    
    // Test with the token
    const testResponse = await fetch(`${MOOV_DOMAIN}/accounts/${MOOV_ACCOUNT_ID}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${tokenData.access_token}`,
        'Accept': 'application/json'
      }
    })
    
    console.log(`  Test request status: ${testResponse.status}`)
    
    if (testResponse.ok) {
      const account = await testResponse.json()
      console.log(`  ✅ SUCCESS! Account retrieved:`)
      console.log(`    Name: ${account.displayName}`)
      console.log(`    Type: ${account.accountType}`)
    } else {
      const error = await testResponse.text()
      console.log(`  ❌ Failed: ${error || 'No error message'}`)
    }
    
  } catch (error) {
    console.log(`  ❌ Error: ${error.message}`)
  }
}

async function main() {
  // Test 1: Standard client credentials
  await testAuth('Test 1: Standard client credentials', {
    grant_type: 'client_credentials',
    client_id: MOOV_PUBLIC_KEY,
    client_secret: MOOV_SECRET_KEY,
    scope: '/accounts.read /accounts.write'
  })
  
  // Test 2: With account context in scope
  await testAuth('Test 2: With account context in scope', {
    grant_type: 'client_credentials',
    client_id: MOOV_PUBLIC_KEY,
    client_secret: MOOV_SECRET_KEY,
    scope: `/accounts/${MOOV_ACCOUNT_ID}/profile.read /accounts/${MOOV_ACCOUNT_ID}/profile.write`
  })
  
  // Test 3: Different scope format
  await testAuth('Test 3: Connected account scopes', {
    grant_type: 'client_credentials',
    client_id: MOOV_PUBLIC_KEY,
    client_secret: MOOV_SECRET_KEY,
    scope: '/accounts.read /accounts.write /accounts/*/profile.read'
  })
  
  // Test 4: Minimal scope
  await testAuth('Test 4: Minimal scope', {
    grant_type: 'client_credentials',
    client_id: MOOV_PUBLIC_KEY,
    client_secret: MOOV_SECRET_KEY,
    scope: '/ping'
  })
  
  // Test 5: No scope
  await testAuth('Test 5: No scope specified', {
    grant_type: 'client_credentials',
    client_id: MOOV_PUBLIC_KEY,
    client_secret: MOOV_SECRET_KEY
  })
  
  console.log('\n' + '='.repeat(50))
  console.log('\n📝 Analysis:')
  console.log('If all tests return 401, the issue is likely:')
  console.log('1. The Account ID doesn\'t match the API keys')
  console.log('2. The API keys are for a different account')
  console.log('3. The account needs to be set up as a facilitator/platform account')
  console.log('4. You might need to use Moov Connect or Dashboard to properly set up the integration')
}

main()
