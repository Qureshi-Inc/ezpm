#!/usr/bin/env node

/**
 * Test with different headers to see if that's the issue
 */

require('dotenv').config({ path: '.env.local' })

const MOOV_DOMAIN = process.env.MOOV_DOMAIN || 'https://api.moov.io'
const MOOV_ACCOUNT_ID = process.env.MOOV_ACCOUNT_ID
const MOOV_PUBLIC_KEY = process.env.MOOV_PUBLIC_KEY
const MOOV_SECRET_KEY = process.env.MOOV_SECRET_KEY

console.log('🔍 Testing Moov API with Different Headers')
console.log('=' .repeat(50))

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
      scope: '/accounts.write'
    })
  })
  
  const data = await response.json()
  return data.access_token
}

async function testWithHeaders(description, headers) {
  console.log(`\n${description}`)
  console.log('Headers:', JSON.stringify(headers, null, 2))
  
  try {
    const response = await fetch(`${MOOV_DOMAIN}/accounts/${MOOV_ACCOUNT_ID}`, {
      method: 'GET',
      headers
    })
    
    console.log(`Status: ${response.status}`)
    
    const text = await response.text()
    if (text) {
      console.log(`Response: ${text.substring(0, 200)}`)
    } else {
      console.log('Response: (empty)')
    }
    
    // Check response headers
    const interestingHeaders = ['x-request-id', 'x-moov-request-id', 'www-authenticate', 'x-error-message']
    for (const header of interestingHeaders) {
      const value = response.headers.get(header)
      if (value) {
        console.log(`${header}: ${value}`)
      }
    }
    
  } catch (error) {
    console.log(`Error: ${error.message}`)
  }
}

async function main() {
  const token = await getToken()
  console.log('\n✅ Token obtained\n')
  
  // Test 1: With API version header
  await testWithHeaders('Test 1: With x-moov-version header', {
    'Authorization': `Bearer ${token}`,
    'Accept': 'application/json',
    'x-moov-version': '2024-04-10'  // Latest API version
  })
  
  // Test 2: With different Accept header
  await testWithHeaders('Test 2: With Accept: application/vnd.api+json', {
    'Authorization': `Bearer ${token}`,
    'Accept': 'application/vnd.api+json'
  })
  
  // Test 3: With User-Agent
  await testWithHeaders('Test 3: With User-Agent', {
    'Authorization': `Bearer ${token}`,
    'Accept': 'application/json',
    'User-Agent': 'EZ-Property-Manager/1.0'
  })
  
  // Test 4: Minimal headers
  await testWithHeaders('Test 4: Minimal (just Authorization)', {
    'Authorization': `Bearer ${token}`
  })
  
  // Test 5: With X-Account-ID header (different from path)
  await testWithHeaders('Test 5: With X-Account-ID header', {
    'Authorization': `Bearer ${token}`,
    'Accept': 'application/json',
    'X-Account-ID': MOOV_ACCOUNT_ID
  })
  
  // Test 6: Try the application ID instead
  await testWithHeaders('Test 6: Using Application ID in path', {
    'Authorization': `Bearer ${token}`,
    'Accept': 'application/json'
  })
  
  // Note: For test 6, we'll actually change the URL
  console.log('\nTest 7: Trying with Application ID in URL')
  const appId = '93103bba-eebe-4540-a717-05aa34a24ef3'  // From token
  console.log(`URL: ${MOOV_DOMAIN}/accounts/${appId}`)
  
  const response = await fetch(`${MOOV_DOMAIN}/accounts/${appId}`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/json'
    }
  })
  
  console.log(`Status: ${response.status}`)
  const text = await response.text()
  console.log(`Response: ${text || '(empty)'}`)
}

main().catch(console.error)
