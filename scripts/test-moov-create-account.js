#!/usr/bin/env node

/**
 * Test creating connected accounts with Moov
 * This is what we need for tenant accounts
 */

require('dotenv').config({ path: '.env.local' })

const MOOV_DOMAIN = process.env.MOOV_DOMAIN || 'https://api.moov.io'
const MOOV_ACCOUNT_ID = process.env.MOOV_ACCOUNT_ID
const MOOV_PUBLIC_KEY = process.env.MOOV_PUBLIC_KEY
const MOOV_SECRET_KEY = process.env.MOOV_SECRET_KEY

console.log('🏗️  Moov Account Creation Test')
console.log('=' .repeat(50))

async function testAccountCreation() {
  try {
    // First, get a token with broad account creation scope
    console.log('\n1. Getting OAuth token for account creation...')
    
    // Try different scope combinations
    const scopesToTry = [
      '/accounts.write',  // Generic account write
      '/accounts.write /connected-accounts.write',  // With connected accounts
      '/accounts/create',  // Specific create permission
      ''  // No scope (use default)
    ]
    
    let token = null
    let workingScope = null
    
    for (const scope of scopesToTry) {
      console.log(`\n  Trying scope: "${scope || '(default)'}"`)
      
      const params = {
        grant_type: 'client_credentials',
        client_id: MOOV_PUBLIC_KEY,
        client_secret: MOOV_SECRET_KEY
      }
      
      if (scope) {
        params.scope = scope
      }
      
      const response = await fetch(`${MOOV_DOMAIN}/oauth2/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams(params)
      })
      
      if (response.ok) {
        const data = await response.json()
        token = data.access_token
        workingScope = data.scope
        console.log(`  ✅ Token obtained with scope: ${workingScope}`)
        break
      } else {
        const error = await response.text()
        console.log(`  ❌ Failed: ${error}`)
      }
    }
    
    if (!token) {
      console.log('\n❌ Could not obtain a valid token')
      return
    }
    
    // Now try to create an account
    console.log('\n2. Creating a test account...')
    
    const testEmail = `test-${Date.now()}@example.com`
    const accountData = {
      accountType: 'individual',
      profile: {
        individual: {
          name: {
            firstName: 'Test',
            lastName: `User-${Date.now()}`
          },
          email: testEmail
        }
      },
      capabilities: ['transfers', 'send-funds', 'wallet'],  // Request basic capabilities
      metadata: {
        test: 'true',
        created_by: 'test-script'
      }
    }
    
    console.log('  Account data:', JSON.stringify(accountData, null, 2))
    
    const createResponse = await fetch(`${MOOV_DOMAIN}/accounts`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'X-Account-ID': MOOV_ACCOUNT_ID  // Try with facilitator account ID
      },
      body: JSON.stringify(accountData)
    })
    
    console.log(`\n  Response status: ${createResponse.status}`)
    
    const responseText = await createResponse.text()
    
    if (createResponse.ok) {
      const account = JSON.parse(responseText)
      console.log('  ✅ Account created successfully!')
      console.log('  Account details:')
      console.log(`    ID: ${account.accountID}`)
      console.log(`    Email: ${testEmail}`)
      console.log(`    Display Name: ${account.displayName}`)
      console.log(`    Type: ${account.accountType}`)
      
      // Try to link a bank account to this new account
      console.log('\n3. Testing bank account linking...')
      await testBankAccountLinking(token, account.accountID)
      
    } else {
      console.log('  ❌ Account creation failed')
      console.log(`  Error: ${responseText}`)
      
      // Try to parse error
      try {
        const error = JSON.parse(responseText)
        if (error.error) {
          console.log(`  Error code: ${error.error}`)
          console.log(`  Message: ${error.message || error.error_description}`)
        }
      } catch (e) {
        // Not JSON
      }
    }
    
  } catch (error) {
    console.error('\n❌ Unexpected error:', error.message)
  }
}

async function testBankAccountLinking(token, accountId) {
  try {
    const bankData = {
      account: {
        accountNumber: '1234567890',
        routingNumber: '021000021',
        bankAccountType: 'checking',
        holderName: 'Test User',
        holderType: 'individual'
      }
    }
    
    console.log('  Linking bank account to:', accountId)
    
    const response = await fetch(`${MOOV_DOMAIN}/accounts/${accountId}/bank-accounts`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(bankData)
    })
    
    console.log(`  Response status: ${response.status}`)
    
    if (response.ok) {
      const bankAccount = await response.json()
      console.log('  ✅ Bank account linked!')
      console.log(`    Bank Account ID: ${bankAccount.bankAccountID}`)
      console.log(`    Status: ${bankAccount.status}`)
    } else {
      const error = await response.text()
      console.log('  ❌ Bank account linking failed:', error)
    }
    
  } catch (error) {
    console.log('  ❌ Error linking bank account:', error.message)
  }
}

console.log('\n📝 Testing account creation flow...\n')
console.log('This test will:')
console.log('1. Get an OAuth token')
console.log('2. Create a new connected account')
console.log('3. Link a test bank account to it')
console.log('\nThis is the flow we need for tenant onboarding.')

testAccountCreation()
