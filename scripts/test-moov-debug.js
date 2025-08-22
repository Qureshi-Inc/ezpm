#!/usr/bin/env node

/**
 * Debug script to understand Moov API authentication issues
 */

require('dotenv').config({ path: '.env.local' })

const MOOV_DOMAIN = process.env.MOOV_DOMAIN || 'https://api.moov.io'
const MOOV_ACCOUNT_ID = process.env.MOOV_ACCOUNT_ID
const MOOV_PUBLIC_KEY = process.env.MOOV_PUBLIC_KEY
const MOOV_SECRET_KEY = process.env.MOOV_SECRET_KEY

console.log('🔍 Moov API Debug')
console.log('=' .repeat(50))
console.log('\nCurrent Configuration:')
console.log(`  Domain: ${MOOV_DOMAIN}`)
console.log(`  Account ID: ${MOOV_ACCOUNT_ID}`)
console.log(`  Public Key: ${MOOV_PUBLIC_KEY}`)
console.log(`  Secret Key: ***${MOOV_SECRET_KEY?.slice(-4)}`)

async function debugAuth() {
  try {
    // Test 1: Basic token generation
    console.log('\n1. Testing basic OAuth token generation...')
    
    const tokenResponse = await fetch(`${MOOV_DOMAIN}/oauth2/token`, {
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
    
    console.log(`  Status: ${tokenResponse.status}`)
    
    if (!tokenResponse.ok) {
      const error = await tokenResponse.text()
      console.log(`  ❌ Token generation failed: ${error}`)
      return
    }
    
    const tokenData = await tokenResponse.json()
    const token = tokenData.access_token
    console.log(`  ✅ Token obtained`)
    console.log(`  Token type: ${tokenData.token_type}`)
    console.log(`  Scope granted: ${tokenData.scope}`)
    
    // Decode token
    try {
      const parts = token.split('.')
      if (parts.length === 3) {
        const header = JSON.parse(Buffer.from(parts[0], 'base64').toString())
        const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString())
        
        console.log('\n  Token Header:')
        console.log('   ', JSON.stringify(header, null, 2).replace(/\n/g, '\n    '))
        
        console.log('\n  Token Payload:')
        console.log('   ', JSON.stringify(payload, null, 2).replace(/\n/g, '\n    '))
        
        // Extract important fields
        if (payload.aid) console.log(`\n  Application ID: ${payload.aid}`)
        if (payload.caid) console.log(`  Connected Account ID: ${payload.caid}`)
        if (payload.sub) console.log(`  Subject: ${payload.sub}`)
        if (payload.iss) console.log(`  Issuer: ${payload.iss}`)
      }
    } catch (e) {
      console.log('  Token is not a JWT or could not be decoded')
    }
    
    // Test 2: Try different API endpoints
    console.log('\n2. Testing various API endpoints...')
    
    const endpoints = [
      { method: 'GET', path: `/accounts/${MOOV_ACCOUNT_ID}`, description: 'Get specific account' },
      { method: 'GET', path: '/accounts', description: 'List accounts' },
      { method: 'POST', path: '/accounts', description: 'Create account', 
        body: { accountType: 'individual', profile: { individual: { name: { firstName: 'Test', lastName: 'Debug' }, email: 'test@debug.com' }}}
      },
      { method: 'GET', path: `/accounts/${MOOV_ACCOUNT_ID}/capabilities`, description: 'Get capabilities' },
      { method: 'GET', path: '/ping', description: 'Ping endpoint' },
    ]
    
    for (const endpoint of endpoints) {
      console.log(`\n  Testing: ${endpoint.method} ${endpoint.path}`)
      console.log(`  Purpose: ${endpoint.description}`)
      
      const options = {
        method: endpoint.method,
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/json',
        }
      }
      
      if (endpoint.body) {
        options.headers['Content-Type'] = 'application/json'
        options.body = JSON.stringify(endpoint.body)
      }
      
      try {
        const response = await fetch(`${MOOV_DOMAIN}${endpoint.path}`, options)
        console.log(`  Response: ${response.status} ${response.statusText}`)
        
        // Check specific headers
        const wwwAuth = response.headers.get('www-authenticate')
        if (wwwAuth) {
          console.log(`  WWW-Authenticate: ${wwwAuth}`)
        }
        
        const body = await response.text()
        if (body) {
          try {
            const json = JSON.parse(body)
            console.log(`  Body:`, JSON.stringify(json, null, 2).substring(0, 200))
          } catch (e) {
            console.log(`  Body (text): ${body.substring(0, 200)}`)
          }
        } else {
          console.log(`  Body: (empty)`)
        }
      } catch (error) {
        console.log(`  Error: ${error.message}`)
      }
    }
    
    // Test 3: Try without Authorization header
    console.log('\n3. Testing without Authorization header (to see different error)...')
    const noAuthResponse = await fetch(`${MOOV_DOMAIN}/accounts/${MOOV_ACCOUNT_ID}`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json'
      }
    })
    console.log(`  Status without auth: ${noAuthResponse.status}`)
    const noAuthBody = await noAuthResponse.text()
    console.log(`  Response: ${noAuthBody || '(empty)'}`)
    
    // Test 4: Try with wrong token
    console.log('\n4. Testing with invalid token (to see different error)...')
    const badTokenResponse = await fetch(`${MOOV_DOMAIN}/accounts/${MOOV_ACCOUNT_ID}`, {
      method: 'GET',
      headers: {
        'Authorization': 'Bearer invalid-token-here',
        'Accept': 'application/json'
      }
    })
    console.log(`  Status with bad token: ${badTokenResponse.status}`)
    const badTokenBody = await badTokenResponse.text()
    console.log(`  Response: ${badTokenBody || '(empty)'}`)
    
  } catch (error) {
    console.error('\n❌ Unexpected error:', error)
  }
}

console.log('\n🔧 Running comprehensive debug tests...\n')
debugAuth().then(() => {
  console.log('\n' + '='.repeat(50))
  console.log('\n📝 Analysis:')
  console.log('If all authenticated requests return 401 with empty body:')
  console.log('- The token is valid but lacks permissions')
  console.log('- The account/application might not be properly configured')
  console.log('- You might need a different type of Moov account (Platform/Facilitator)')
  console.log('\nRecommended action:')
  console.log('Contact Moov support with these test results')
})
