#!/usr/bin/env node

/**
 * Script to find the correct Moov account ID for your API keys
 */

require('dotenv').config({ path: '.env.local' })

const MOOV_DOMAIN = process.env.MOOV_DOMAIN || 'https://api.moov.io'
const MOOV_PUBLIC_KEY = process.env.MOOV_PUBLIC_KEY
const MOOV_SECRET_KEY = process.env.MOOV_SECRET_KEY

console.log('🔍 Finding Your Moov Account')
console.log('=' .repeat(50))

async function findAccount() {
  try {
    // Get token without account context
    console.log('\n1. Getting OAuth token...')
    const tokenResponse = await fetch(`${MOOV_DOMAIN}/oauth2/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: MOOV_PUBLIC_KEY,
        client_secret: MOOV_SECRET_KEY,
        scope: '/profile.read'  // Try a self-referential scope
      })
    })
    
    if (!tokenResponse.ok) {
      const error = await tokenResponse.text()
      console.log('Failed to get token:', error)
      
      // Try different scope
      console.log('\n2. Trying with different scope...')
      const tokenResponse2 = await fetch(`${MOOV_DOMAIN}/oauth2/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          grant_type: 'client_credentials',
          client_id: MOOV_PUBLIC_KEY,
          client_secret: MOOV_SECRET_KEY,
          scope: '/accounts.write'  // This worked before
        })
      })
      
      if (tokenResponse2.ok) {
        const data = await tokenResponse2.json()
        console.log('✅ Token obtained with /accounts.write scope')
        
        // Decode the token to see if it contains account info
        try {
          const parts = data.access_token.split('.')
          if (parts.length === 3) {
            const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString())
            console.log('\n3. Token payload:')
            console.log(JSON.stringify(payload, null, 2))
            
            if (payload.account_id || payload.accountID || payload.sub) {
              console.log('\n✅ FOUND ACCOUNT REFERENCE IN TOKEN:')
              console.log(`  Account: ${payload.account_id || payload.accountID || payload.sub}`)
            }
          }
        } catch (e) {
          console.log('Could not decode token as JWT')
        }
      }
    } else {
      const data = await tokenResponse.json()
      console.log('✅ Token obtained')
      
      // Try to decode token
      try {
        const parts = data.access_token.split('.')
        if (parts.length === 3) {
          const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString())
          console.log('\nToken payload:')
          console.log(JSON.stringify(payload, null, 2))
        }
      } catch (e) {
        // Not a JWT
      }
    }
    
    console.log('\n' + '='.repeat(50))
    console.log('\n📝 Next Steps:')
    console.log('1. Log into your Moov Dashboard: https://dashboard.moov.io')
    console.log('2. Find your account ID (it should be displayed on the main page)')
    console.log('3. Update MOOV_ACCOUNT_ID in your .env.local with the correct ID')
    console.log('\nNote: The account ID should be the one that owns these API keys.')
    console.log('This is YOUR platform/facilitator account, not a test account.')
    
  } catch (error) {
    console.error('Error:', error.message)
  }
}

findAccount()
