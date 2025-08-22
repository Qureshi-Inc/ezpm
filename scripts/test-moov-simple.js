#!/usr/bin/env node

/**
 * Simple test to check what we can access with the Moov token
 */

require('dotenv').config({ path: '.env.local' })

const MOOV_DOMAIN = process.env.MOOV_DOMAIN || 'https://api.moov.io'
const MOOV_ACCOUNT_ID = process.env.MOOV_ACCOUNT_ID
const MOOV_PUBLIC_KEY = process.env.MOOV_PUBLIC_KEY
const MOOV_SECRET_KEY = process.env.MOOV_SECRET_KEY

async function getToken() {
  const response = await fetch(`${MOOV_DOMAIN}/oauth2/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: MOOV_PUBLIC_KEY,
      client_secret: MOOV_SECRET_KEY,
      scope: '/accounts.read /accounts.write /bank-accounts.read /bank-accounts.write /transfers.read /transfers.write'
    })
  })
  
  if (!response.ok) {
    throw new Error(`Failed to get token: ${response.status}`)
  }
  
  const data = await response.json()
  return data.access_token
}

async function testEndpoint(token, method, path, body = null) {
  console.log(`\nTesting: ${method} ${path}`)
  
  const options = {
    method,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/json',
    }
  }
  
  if (body) {
    options.headers['Content-Type'] = 'application/json'
    options.body = JSON.stringify(body)
  }
  
  try {
    const response = await fetch(`${MOOV_DOMAIN}${path}`, options)
    console.log(`  Status: ${response.status}`)
    
    const text = await response.text()
    if (text) {
      try {
        const json = JSON.parse(text)
        console.log(`  Response:`, JSON.stringify(json, null, 2).substring(0, 500))
      } catch (e) {
        console.log(`  Response (text): ${text.substring(0, 200)}`)
      }
    } else {
      console.log(`  Response: (empty)`)
    }
    
    return response.status
  } catch (error) {
    console.log(`  Error: ${error.message}`)
    return null
  }
}

async function main() {
  console.log('🔍 Moov API Access Test')
  console.log('=' .repeat(50))
  
  try {
    // Get token
    console.log('\nGetting OAuth token...')
    const token = await getToken()
    console.log('✅ Token obtained')
    
    // Test various endpoints
    console.log('\n' + '='.repeat(50))
    console.log('Testing API endpoints:')
    
    // Try to get the account directly
    await testEndpoint(token, 'GET', `/accounts/${MOOV_ACCOUNT_ID}`)
    
    // Try to list accounts (maybe we can see connected accounts)
    await testEndpoint(token, 'GET', '/accounts')
    
    // Try to get account with query params
    await testEndpoint(token, 'GET', `/accounts?accountID=${MOOV_ACCOUNT_ID}`)
    
    // Try creating a connected account (this is what we actually need)
    const testAccount = {
      accountType: 'individual',
      profile: {
        individual: {
          name: {
            firstName: 'Test',
            lastName: 'User'
          },
          email: `test-${Date.now()}@example.com`
        }
      }
    }
    
    await testEndpoint(token, 'POST', '/accounts', testAccount)
    
    // Try to get capabilities (maybe this works)
    await testEndpoint(token, 'GET', `/accounts/${MOOV_ACCOUNT_ID}/capabilities`)
    
    // Try to get the root endpoint
    await testEndpoint(token, 'GET', '/')
    
    // Try ping endpoint if it exists
    await testEndpoint(token, 'GET', '/ping')
    
  } catch (error) {
    console.error('\n❌ Error:', error.message)
  }
}

main()
