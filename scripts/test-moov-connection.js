#!/usr/bin/env node

/**
 * Test script to verify Moov API connection and credentials
 * Run with: node scripts/test-moov-connection.js
 */

require('dotenv').config({ path: '.env.local' })

const MOOV_DOMAIN = process.env.MOOV_DOMAIN || 'https://api.moov.io'
const MOOV_ACCOUNT_ID = process.env.MOOV_ACCOUNT_ID
const MOOV_PUBLIC_KEY = process.env.MOOV_PUBLIC_KEY
const MOOV_SECRET_KEY = process.env.MOOV_SECRET_KEY

console.log('🔧 Moov Configuration Test')
console.log('=' .repeat(50))

// Check environment variables
console.log('\n📋 Environment Variables:')
console.log(`  MOOV_DOMAIN: ${MOOV_DOMAIN}`)
console.log(`  MOOV_ACCOUNT_ID: ${MOOV_ACCOUNT_ID ? '✅ Set' : '❌ Missing'}`)
console.log(`  MOOV_PUBLIC_KEY: ${MOOV_PUBLIC_KEY ? '✅ Set (***' + MOOV_PUBLIC_KEY.slice(-4) + ')' : '❌ Missing'}`)
console.log(`  MOOV_SECRET_KEY: ${MOOV_SECRET_KEY ? '✅ Set (***' + MOOV_SECRET_KEY.slice(-4) + ')' : '❌ Missing'}`)

if (!MOOV_ACCOUNT_ID || !MOOV_PUBLIC_KEY || !MOOV_SECRET_KEY) {
  console.error('\n❌ Missing required environment variables!')
  console.error('Please ensure all MOOV_* variables are set in your .env.local file')
  process.exit(1)
}

// Test OAuth 2.0 token generation
async function testOAuth() {
  console.log('\n🔐 Testing OAuth 2.0 Token Generation...')
  
  try {
    const response = await fetch(`${MOOV_DOMAIN}/oauth2/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: MOOV_PUBLIC_KEY,
        client_secret: MOOV_SECRET_KEY,
        scope: `/accounts/${MOOV_ACCOUNT_ID}/profile.read /accounts/${MOOV_ACCOUNT_ID}/profile.write /accounts/${MOOV_ACCOUNT_ID}/bank-accounts.read /accounts/${MOOV_ACCOUNT_ID}/bank-accounts.write /accounts/${MOOV_ACCOUNT_ID}/transfers.read /accounts/${MOOV_ACCOUNT_ID}/transfers.write`
      })
    })

    console.log(`  Response Status: ${response.status}`)
    
    if (!response.ok) {
      const errorText = await response.text()
      console.error('  ❌ OAuth token generation failed!')
      console.error(`  Error: ${errorText}`)
      return null
    }

    const data = await response.json()
    console.log('  ✅ OAuth token generated successfully!')
    console.log(`  Token Type: ${data.token_type}`)
    console.log(`  Expires In: ${data.expires_in} seconds`)
    console.log(`  Scope: ${data.scope}`)
    
    // Decode token to check contents (if it's a JWT)
    try {
      const tokenParts = data.access_token.split('.')
      if (tokenParts.length === 3) {
        const payload = JSON.parse(Buffer.from(tokenParts[1], 'base64').toString())
        console.log('  Token Payload (decoded):')
        console.log(`    Subject: ${payload.sub || 'N/A'}`)
        console.log(`    Account: ${payload.account || 'N/A'}`)
        console.log(`    Issuer: ${payload.iss || 'N/A'}`)
        if (payload.scope) {
          console.log(`    Scopes in token: ${payload.scope}`)
        }
      }
    } catch (e) {
      // Not a JWT or couldn't decode
      console.log('  Token is not a JWT or could not be decoded')
    }
    
    return data.access_token
  } catch (error) {
    console.error('  ❌ Failed to generate OAuth token:', error.message)
    return null
  }
}

// Test account retrieval
async function testAccountRetrieval(token) {
  console.log('\n👤 Testing Account Retrieval...')
  console.log(`  Account ID: ${MOOV_ACCOUNT_ID}`)
  console.log(`  API Endpoint: ${MOOV_DOMAIN}/accounts/${MOOV_ACCOUNT_ID}`)
  console.log(`  Token (first 20 chars): ${token.substring(0, 20)}...`)
  
  try {
    const headers = {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/json',
      'X-Account-ID': MOOV_ACCOUNT_ID
    }
    
    console.log('  Request Headers:', {
      'Authorization': `Bearer ${token.substring(0, 20)}...`,
      'Accept': headers.Accept,
      'X-Account-ID': headers['X-Account-ID']
    })
    
    const response = await fetch(`${MOOV_DOMAIN}/accounts/${MOOV_ACCOUNT_ID}`, {
      method: 'GET',
      headers
    })

    console.log(`  Response Status: ${response.status}`)
    console.log(`  Response Headers:`)
    for (const [key, value] of response.headers.entries()) {
      if (key.toLowerCase().includes('error') || key.toLowerCase().includes('message') || key.toLowerCase().includes('www-authenticate')) {
        console.log(`    ${key}: ${value}`)
      }
    }
    
    if (!response.ok) {
      const errorText = await response.text()
      console.error('  ❌ Account retrieval failed!')
      console.error(`  Error Body: ${errorText}`)
      
      // Try to parse as JSON for more details
      try {
        const errorJson = JSON.parse(errorText)
        console.error('  Parsed Error:', JSON.stringify(errorJson, null, 2))
      } catch (e) {
        // Not JSON, that's okay
      }
      
      // Try alternate endpoints
      console.log('\n  🔍 Trying alternate approach - List accounts...')
      const listResponse = await fetch(`${MOOV_DOMAIN}/accounts`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/json'
        }
      })
      
      console.log(`  List Accounts Status: ${listResponse.status}`)
      if (listResponse.ok) {
        const accounts = await listResponse.json()
        console.log(`  Found ${accounts.length || 0} accounts`)
        if (accounts.length > 0) {
          console.log('  First account:', {
            accountID: accounts[0].accountID,
            displayName: accounts[0].displayName,
            accountType: accounts[0].accountType
          })
        }
      } else {
        const listError = await listResponse.text()
        console.log(`  List Accounts Error: ${listError}`)
      }
      
      return
    }

    const account = await response.json()
    console.log('  ✅ Account retrieved successfully!')
    console.log(`  Account Type: ${account.accountType}`)
    console.log(`  Display Name: ${account.displayName}`)
    console.log(`  Created: ${account.createdOn}`)
    
    // Check capabilities
    if (account.capabilities) {
      console.log('\n  📊 Account Capabilities:')
      for (const [capability, status] of Object.entries(account.capabilities)) {
        const icon = status === 'enabled' ? '✅' : status === 'disabled' ? '❌' : '⏳'
        console.log(`    ${icon} ${capability}: ${status}`)
      }
    }
    
    return account
  } catch (error) {
    console.error('  ❌ Failed to retrieve account:', error.message)
  }
}

// Test creating a test account
async function testAccountCreation(token) {
  console.log('\n🧪 Testing Account Creation (Test Account)...')
  
  const testEmail = `test-${Date.now()}@example.com`
  console.log(`  Test Email: ${testEmail}`)
  console.log(`  API Endpoint: ${MOOV_DOMAIN}/accounts`)
  
  const requestBody = {
    accountType: 'individual',
    profile: {
      individual: {
        name: {
          firstName: 'Test',
          lastName: 'User'
        },
        email: testEmail
      }
    },
    metadata: {
      test_account: 'true',
      created_by: 'test-script'
    }
  }
  
  console.log('  Request Body:', JSON.stringify(requestBody, null, 2))
  
  try {
    const response = await fetch(`${MOOV_DOMAIN}/accounts`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'X-Account-ID': MOOV_ACCOUNT_ID
      },
      body: JSON.stringify(requestBody)
    })

    console.log(`  Response Status: ${response.status}`)
    console.log(`  Response Headers:`)
    for (const [key, value] of response.headers.entries()) {
      if (key.toLowerCase().includes('error') || key.toLowerCase().includes('message')) {
        console.log(`    ${key}: ${value}`)
      }
    }
    
    if (!response.ok) {
      const errorText = await response.text()
      console.error('  ❌ Account creation failed!')
      console.error(`  Error Body: ${errorText}`)
      
      // Parse error for more details
      try {
        const errorData = JSON.parse(errorText)
        console.error('  Parsed Error:', JSON.stringify(errorData, null, 2))
        if (errorData.error) {
          console.error(`  Error Code: ${errorData.error}`)
          console.error(`  Error Message: ${errorData.error_description || errorData.message}`)
        }
      } catch (e) {
        // Not JSON error
      }
      return
    }

    const account = await response.json()
    console.log('  ✅ Test account created successfully!')
    console.log(`  Account ID: ${account.accountID}`)
    console.log(`  Email: ${testEmail}`)
    
    return account
  } catch (error) {
    console.error('  ❌ Failed to create test account:', error.message)
  }
}

// Main test function
async function runTests() {
  console.log('\n🚀 Starting Moov API Tests...\n')
  
  // Test OAuth
  const token = await testOAuth()
  if (!token) {
    console.error('\n❌ Cannot proceed without valid OAuth token')
    process.exit(1)
  }
  
  // Test account retrieval
  const account = await testAccountRetrieval(token)
  
  // Test account creation
  await testAccountCreation(token)
  
  console.log('\n' + '='.repeat(50))
  console.log('✅ Moov API tests completed!')
  
  // Provide setup instructions if needed
  if (!account) {
    console.log('\n📝 Next Steps:')
    console.log('1. Verify your Moov API credentials in the Moov Dashboard')
    console.log('2. Ensure you have the correct account ID')
    console.log('3. Check if you\'re using the right environment (sandbox vs production)')
  }
}

// Run the tests
runTests().catch(error => {
  console.error('\n❌ Unexpected error:', error)
  process.exit(1)
})
