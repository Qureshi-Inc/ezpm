// Moov API configuration
const MOOV_DOMAIN = process.env.MOOV_DOMAIN || 'https://api.moov.io'
const MOOV_ACCOUNT_ID = process.env.MOOV_ACCOUNT_ID
const MOOV_PUBLIC_KEY = process.env.MOOV_PUBLIC_KEY
const MOOV_SECRET_KEY = process.env.MOOV_SECRET_KEY

// Helper function to check required environment variables
function checkMoovConfig() {
  if (!MOOV_ACCOUNT_ID) {
    throw new Error('Missing MOOV_ACCOUNT_ID environment variable')
  }
  
  if (!MOOV_PUBLIC_KEY) {
    throw new Error('Missing MOOV_PUBLIC_KEY environment variable')
  }
  
  if (!MOOV_SECRET_KEY) {
    throw new Error('Missing MOOV_SECRET_KEY environment variable')
  }
}

// Helper function to get authorization header
function getAuthHeader() {
  const authHeader = `Basic ${Buffer.from(`${MOOV_PUBLIC_KEY}:${MOOV_SECRET_KEY}`).toString('base64')}`
  console.log('Generated auth header:', {
    publicKey: MOOV_PUBLIC_KEY ? '***' + MOOV_PUBLIC_KEY.slice(-4) : 'missing',
    secretKey: MOOV_SECRET_KEY ? '***' + MOOV_SECRET_KEY.slice(-4) : 'missing',
    authHeader: '***' + authHeader.slice(-10)
  })
  return authHeader
}

// Helper function to create a Moov account for a tenant
export async function createMoovAccount(tenantData: {
  firstName: string
  lastName: string
  email: string
  tenantId: string
}) {
  // Check config when function is actually called
  checkMoovConfig()
  
  try {
    const response = await fetch(`${MOOV_DOMAIN}/accounts`, {
      method: 'POST',
      headers: {
        'Authorization': getAuthHeader(),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        accountType: 'individual',
        profile: {
          individual: {
            name: {
              firstName: tenantData.firstName,
              lastName: tenantData.lastName
            },
            email: tenantData.email
          }
        },
        metadata: {
          tenant_id: tenantData.tenantId
        }
      })
    })
    
    if (!response.ok) {
      throw new Error(`Failed to create Moov account: ${response.statusText}`)
    }
    
    const account = await response.json()
    return account
  } catch (error) {
    console.error('Failed to create Moov account:', error)
    throw error
  }
}

// Helper function to create a bank account for a tenant
export async function createBankAccount(accountId: string, bankData: {
  accountNumber: string
  routingNumber: string
  accountType: 'checking' | 'savings'
  accountHolderName: string
}) {
  checkMoovConfig()
  
  try {
    const requestBody = {
      account: {
        accountNumber: bankData.accountNumber,
        routingNumber: bankData.routingNumber,
        type: bankData.accountType,
        holderName: bankData.accountHolderName
      }
    }
    
    const url = `${MOOV_DOMAIN}/accounts/${accountId}/payment-methods`
    const headers = {
      'Authorization': getAuthHeader(),
      'Content-Type': 'application/json'
    }
    
    console.log('Creating bank account with details:', {
      url,
      accountId,
      requestBody: {
        ...requestBody,
        account: {
          ...requestBody.account,
          accountNumber: '***' + bankData.accountNumber.slice(-4),
          routingNumber: '***' + bankData.routingNumber.slice(-4)
        }
      },
      headers: {
        ...headers,
        'Authorization': '***' + headers.Authorization.slice(-10)
      }
    })
    
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(requestBody)
    })
    
    console.log('Moov API response:', {
      status: response.status,
      statusText: response.statusText,
      headers: Object.fromEntries(response.headers.entries())
    })
    
    if (!response.ok) {
      const errorText = await response.text()
      console.error('Bank account creation error response:', {
        status: response.status,
        statusText: response.statusText,
        errorBody: errorText,
        url,
        accountId
      })
      throw new Error(`Failed to create bank account: ${response.status} ${response.statusText} - ${errorText}`)
    }
    
    const bankAccount = await response.json()
    console.log('Bank account created successfully:', {
      paymentMethodID: bankAccount.paymentMethodID,
      status: bankAccount.status,
      accountId
    })
    return bankAccount
  } catch (error) {
    console.error('Failed to create bank account:', {
      error: error instanceof Error ? error.message : error,
      accountId,
      bankData: {
        ...bankData,
        accountNumber: '***' + bankData.accountNumber.slice(-4),
        routingNumber: '***' + bankData.routingNumber.slice(-4)
      }
    })
    throw error
  }
}

// Helper function to create a transfer
export async function createTransfer(transferData: {
  sourceAccountId: string
  destinationAccountId: string
  amount: number
  description: string
  metadata?: Record<string, string>
}) {
  checkMoovConfig()
  
  try {
    const response = await fetch(`${MOOV_DOMAIN}/transfers`, {
      method: 'POST',
      headers: {
        'Authorization': getAuthHeader(),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        source: {
          accountID: transferData.sourceAccountId
        },
        destination: {
          accountID: transferData.destinationAccountId
        },
        amount: {
          currency: 'USD',
          value: transferData.amount
        },
        description: transferData.description,
        metadata: transferData.metadata || {}
      })
    })
    
    if (!response.ok) {
      const errorText = await response.text()
      console.error('Transfer creation error:', errorText)
      throw new Error(`Failed to create transfer: ${response.status} ${response.statusText}`)
    }
    
    const transfer = await response.json()
    console.log('Transfer created successfully:', transfer.transferID)
    return transfer
  } catch (error) {
    console.error('Failed to create transfer:', error)
    throw error
  }
}

// Helper function to get transfer status
export async function getTransferStatus(transferId: string) {
  checkMoovConfig()
  
  try {
    const response = await fetch(`${MOOV_DOMAIN}/transfers/${transferId}`, {
      method: 'GET',
      headers: {
        'Authorization': getAuthHeader()
      }
    })
    
    if (!response.ok) {
      throw new Error(`Failed to get transfer status: ${response.status} ${response.statusText}`)
    }
    
    const transfer = await response.json()
    return transfer
  } catch (error) {
    console.error('Failed to get transfer status:', error)
    throw error
  }
}

// Helper function to generate access token for Moov.js
export async function generateMoovToken(scopes: string[]) {
  // Check config when function is actually called
  checkMoovConfig()
  
  console.log('Generating Moov token with config:', {
    domain: MOOV_DOMAIN,
    accountId: MOOV_ACCOUNT_ID,
    publicKey: MOOV_PUBLIC_KEY ? '***' + MOOV_PUBLIC_KEY.slice(-4) : 'missing',
    secretKey: MOOV_SECRET_KEY ? '***' + MOOV_SECRET_KEY.slice(-4) : 'missing',
    scopes
  })
  
  try {
    // Use OAuth2 to generate token
    const response = await fetch(`${MOOV_DOMAIN}/oauth2/token`, {
      method: 'POST',
      headers: {
        'Authorization': getAuthHeader(),
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        scope: scopes.join(' ')
      })
    })

    console.log('Moov token response status:', response.status)
    
    if (!response.ok) {
      const errorText = await response.text()
      console.error('Moov token error response:', errorText)
      throw new Error(`Failed to generate token: ${response.status} ${response.statusText}`)
    }

    const data = await response.json()
    console.log('Moov token generated successfully')
    return data.access_token
  } catch (error) {
    console.error('Failed to generate Moov token:', error)
    throw error
  }
}