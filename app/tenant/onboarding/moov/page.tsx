'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ArrowLeft, CheckCircle, AlertCircle, User, Building2, CreditCard, Shield } from 'lucide-react'
import Link from 'next/link'

type OnboardingStep = 'account' | 'identity' | 'bank' | 'verify' | 'complete'

export default function MoovOnboardingPage() {
  const router = useRouter()
  const [moovReady, setMoovReady] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [step, setStep] = useState<OnboardingStep>('account')
  const [accountId, setAccountId] = useState<string | null>(null)
  const [bankAccountId, setBankAccountId] = useState<string | null>(null)
  const [capabilities, setCapabilities] = useState<string[]>([])
  
  // Form states
  const [accountData, setAccountData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    addressLine1: '',
    addressLine2: '',
    city: '',
    state: '',
    postalCode: '',
    birthDate: '',
    ssnLast4: ''
  })
  
  const [bankData, setBankData] = useState({
    accountNumber: '',
    routingNumber: '',
    accountType: 'checking' as 'checking' | 'savings'
  })
  
  const [microDeposits, setMicroDeposits] = useState({
    amount1: '',
    amount2: ''
  })

  // Initialize Moov.js
  useEffect(() => {
    const initMoov = async () => {
      try {
        // Load Moov.js script with correct version
        const script = document.createElement('script')
        script.src = 'https://js.moov.io/v1'
        script.async = true
        
        await new Promise<void>((resolve, reject) => {
          script.onload = () => {
            // Wait for Moov to be available
            const checkMoov = () => {
              const moov = (window as any).Moov
              if (moov && moov.js) {
                console.log('Moov.js loaded successfully')
                setMoovReady(true)
                resolve()
              } else {
                setTimeout(checkMoov, 100)
              }
            }
            checkMoov()
          }
          script.onerror = reject
          document.head.appendChild(script)
        })

        // Check for existing Moov account
        const tenantResponse = await fetch('/api/tenant/moov-account')
        if (tenantResponse.ok) {
          const tenantData = await tenantResponse.json()
          if (tenantData.moovAccountId) {
            setAccountId(tenantData.moovAccountId)
            setStep('bank') // Skip to bank step if account exists
          }
        }

        setLoading(false)
      } catch (err) {
        console.error('Failed to initialize Moov:', err)
        setError('Failed to load Moov.js')
        setLoading(false)
      }
    }

    initMoov()
  }, [])

  // Get Moov token
  const getMoovToken = async (scopes: string[]) => {
    try {
      const response = await fetch('/api/moov/onboarding-token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          accountId,
          scopes
        })
      })

      if (!response.ok) {
        throw new Error('Failed to get Moov token')
      }

      const data = await response.json()
      return data.token
    } catch (err) {
      console.error('Failed to get token:', err)
      throw err
    }
  }

  // Create Moov account with identity verification
  const createAccount = async () => {
    try {
      setError(null)
      setLoading(true)

      const moov = (window as any).Moov
      if (!moov || !moov.js) {
        throw new Error('Moov.js is not loaded')
      }

      // Get token for account creation
      const token = await getMoovToken([
        '/accounts.write',
        `/accounts/${process.env.NEXT_PUBLIC_MOOV_FACILITATOR_ACCOUNT_ID}/profile.read`,
        '/fed.read',
        '/profile-enrichment.read'
      ])

      // Initialize Moov.js with token (if needed for future use)
      // moov.js(token)

      // Format birth date
      const [year, month, day] = accountData.birthDate.split('-')

      // Create account data
      const accountPayload = {
        accountType: 'individual',
        profile: {
          individual: {
            name: {
              firstName: accountData.firstName,
              lastName: accountData.lastName
            },
            email: accountData.email,
            phone: accountData.phone ? {
              number: accountData.phone,
              countryCode: '1'
            } : undefined,
            address: {
              addressLine1: accountData.addressLine1,
              addressLine2: accountData.addressLine2 || undefined,
              city: accountData.city,
              stateOrProvince: accountData.state,
              postalCode: accountData.postalCode,
              country: 'US'
            },
            birthDate: {
              year: parseInt(year),
              month: parseInt(month),
              day: parseInt(day)
            },
            governmentID: {
              ssn: {
                lastFour: accountData.ssnLast4
              }
            }
          }
        },
        capabilities: ['transfers', 'send-funds', 'collect-funds', 'wallet']
      }

      // Create account using Moov API directly
      const response = await fetch('https://api.moov.io/accounts', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'X-Moov-Account-ID': process.env.NEXT_PUBLIC_MOOV_FACILITATOR_ACCOUNT_ID || ''
        },
        body: JSON.stringify(accountPayload)
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to create account')
      }

      const account = await response.json()
      console.log('Account created:', account)
      setAccountId(account.accountID)

      // Save account ID to database
      await fetch('/api/tenant/moov-account', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          moovAccountId: account.accountID
        })
      })

      // Request capabilities using API
      const capabilitiesToken = await getMoovToken([
        `/accounts/${account.accountID}/capabilities.write`
      ])
      
      await fetch(`https://api.moov.io/accounts/${account.accountID}/capabilities`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${capabilitiesToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          capabilities: ['transfers', 'send-funds', 'collect-funds', 'wallet']
        })
      })

      setStep('bank')
      setLoading(false)
    } catch (err: any) {
      console.error('Failed to create account:', err)
      setError(err.message || 'Failed to create account')
      setLoading(false)
    }
  }

  // Add bank account
  const addBankAccount = async () => {
    try {
      setError(null)
      setLoading(true)

      if (!accountId) {
        throw new Error('No account ID found')
      }

      // Get token with bank account scopes
      const token = await getMoovToken([
        `/accounts/${accountId}/bank-accounts.write`,
        `/accounts/${accountId}/bank-accounts.read`
      ])
      
      // Link bank account using API
      const bankAccountPayload = {
        account: {
          accountNumber: bankData.accountNumber,
          routingNumber: bankData.routingNumber,
          bankAccountType: bankData.accountType,
          holderName: `${accountData.firstName} ${accountData.lastName}`,
          holderType: 'individual'
        }
      }

      const response = await fetch(`https://api.moov.io/accounts/${accountId}/bank-accounts`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'X-Wait-For': 'payment-method'
        },
        body: JSON.stringify(bankAccountPayload)
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to add bank account')
      }

      const bankAccount = await response.json()
      console.log('Bank account linked:', bankAccount)
      setBankAccountId(bankAccount.bankAccountID)

      // Save bank account to database
      await fetch('/api/tenant/payment-methods/save-moov-bank', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          moovAccountId: accountId,
          bankAccountId: bankAccount.bankAccountID,
          last4: bankData.accountNumber.slice(-4)
        })
      })

      // Initiate micro-deposits using API
      const microDepositResponse = await fetch(
        `https://api.moov.io/accounts/${accountId}/bank-accounts/${bankAccount.bankAccountID}/micro-deposits`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }
      )

      if (!microDepositResponse.ok) {
        console.warn('Failed to initiate micro-deposits, will need to do manually')
      }

      setStep('verify')
      setLoading(false)
    } catch (err: any) {
      console.error('Failed to add bank account:', err)
      setError(err.message || 'Failed to add bank account')
      setLoading(false)
    }
  }

  // Verify micro-deposits
  const verifyMicroDeposits = async () => {
    try {
      setError(null)
      setLoading(true)

      if (!accountId || !bankAccountId) {
        throw new Error('Missing account or bank account ID')
      }

      // Get token
      const token = await getMoovToken([
        `/accounts/${accountId}/bank-accounts.write`
      ])

      // Convert string amounts to cents
      const amounts = [
        Math.round(parseFloat(microDeposits.amount1) * 100),
        Math.round(parseFloat(microDeposits.amount2) * 100)
      ]

      // Complete micro-deposit verification using API
      const response = await fetch(
        `https://api.moov.io/accounts/${accountId}/bank-accounts/${bankAccountId}/micro-deposits`,
        {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ amounts })
        }
      )

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to verify micro-deposits')
      }

      // Update verification status in database
      await fetch('/api/tenant/payment-methods/verify-micro-deposits', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          bankAccountId,
          amounts
        })
      })

      setStep('complete')
      setLoading(false)
    } catch (err: any) {
      console.error('Failed to verify micro-deposits:', err)
      setError(err.message || 'Failed to verify micro-deposits. Please check the amounts and try again.')
      setLoading(false)
    }
  }


  // Render loading state
  if (loading && !moovReady) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p>Loading Moov onboarding...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <main className="max-w-4xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          <div className="mb-6">
            <Link href="/tenant/payment-methods" className="flex items-center text-blue-600 hover:text-blue-700 mb-4">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Payment Methods
            </Link>
            <h1 className="text-3xl font-bold text-gray-900">Set Up ACH Payments</h1>
            <p className="text-gray-600 mt-2">Complete your account setup to enable ACH bank transfers</p>
          </div>

          {/* Progress Indicator */}
          <div className="mb-6">
            <div className="flex items-center justify-between">
              <div className={`flex items-center ${step === 'account' ? 'text-blue-600' : 'text-gray-400'}`}>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 ${
                  step === 'account' ? 'border-blue-600 bg-blue-50' : 
                  ['identity', 'bank', 'verify', 'complete'].includes(step) ? 'border-green-600 bg-green-50' : 
                  'border-gray-300'
                }`}>
                  {['identity', 'bank', 'verify', 'complete'].includes(step) ? 
                    <CheckCircle className="w-5 h-5 text-green-600" /> : 
                    <User className="w-5 h-5" />
                  }
                </div>
                <span className="ml-2 text-sm font-medium">Account Info</span>
              </div>
              
              <div className={`flex-1 h-0.5 mx-4 ${
                ['identity', 'bank', 'verify', 'complete'].includes(step) ? 'bg-green-600' : 'bg-gray-300'
              }`} />
              
              <div className={`flex items-center ${
                step === 'bank' ? 'text-blue-600' : 
                step === 'identity' || step === 'account' ? 'text-gray-400' : 
                'text-gray-400'
              }`}>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 ${
                  step === 'bank' ? 'border-blue-600 bg-blue-50' : 
                  ['verify', 'complete'].includes(step) ? 'border-green-600 bg-green-50' : 
                  'border-gray-300'
                }`}>
                  {['verify', 'complete'].includes(step) ? 
                    <CheckCircle className="w-5 h-5 text-green-600" /> : 
                    <CreditCard className="w-5 h-5" />
                  }
                </div>
                <span className="ml-2 text-sm font-medium">Bank Account</span>
              </div>
              
              <div className={`flex-1 h-0.5 mx-4 ${
                ['verify', 'complete'].includes(step) ? 'bg-green-600' : 'bg-gray-300'
              }`} />
              
              <div className={`flex items-center ${
                step === 'verify' ? 'text-blue-600' : 
                step === 'complete' ? 'text-gray-400' : 
                'text-gray-400'
              }`}>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 ${
                  step === 'verify' ? 'border-blue-600 bg-blue-50' : 
                  step === 'complete' ? 'border-green-600 bg-green-50' : 
                  'border-gray-300'
                }`}>
                  {step === 'complete' ? 
                    <CheckCircle className="w-5 h-5 text-green-600" /> : 
                    <Shield className="w-5 h-5" />
                  }
                </div>
                <span className="ml-2 text-sm font-medium">Verify</span>
              </div>
            </div>
          </div>

          {error && (
            <Alert variant="destructive" className="mb-6">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Step 1: Account Creation with Identity Verification */}
          {step === 'account' && (
            <Card>
              <CardHeader>
                <CardTitle>Create Your Moov Account</CardTitle>
                <CardDescription>
                  We need this information to verify your identity and enable ACH payments
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={(e) => { e.preventDefault(); createAccount(); }} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="firstName">First Name</Label>
                      <Input
                        id="firstName"
                        value={accountData.firstName}
                        onChange={(e) => setAccountData({...accountData, firstName: e.target.value})}
                        required
                      />
                    </div>
                    <div>
                      <Label htmlFor="lastName">Last Name</Label>
                      <Input
                        id="lastName"
                        value={accountData.lastName}
                        onChange={(e) => setAccountData({...accountData, lastName: e.target.value})}
                        required
                      />
                    </div>
                  </div>

                  <div>
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      value={accountData.email}
                      onChange={(e) => setAccountData({...accountData, email: e.target.value})}
                      required
                    />
                  </div>

                  <div>
                    <Label htmlFor="phone">Phone Number (optional)</Label>
                    <Input
                      id="phone"
                      type="tel"
                      placeholder="1234567890"
                      value={accountData.phone}
                      onChange={(e) => setAccountData({...accountData, phone: e.target.value})}
                    />
                  </div>

                  <div>
                    <Label htmlFor="birthDate">Date of Birth</Label>
                    <Input
                      id="birthDate"
                      type="date"
                      value={accountData.birthDate}
                      onChange={(e) => setAccountData({...accountData, birthDate: e.target.value})}
                      required
                    />
                  </div>

                  <div>
                    <Label htmlFor="ssnLast4">Last 4 Digits of SSN</Label>
                    <Input
                      id="ssnLast4"
                      type="text"
                      maxLength={4}
                      pattern="[0-9]{4}"
                      placeholder="1234"
                      value={accountData.ssnLast4}
                      onChange={(e) => setAccountData({...accountData, ssnLast4: e.target.value})}
                      required
                    />
                    <p className="text-xs text-gray-500 mt-1">Used only for identity verification</p>
                  </div>

                  <div>
                    <Label htmlFor="addressLine1">Street Address</Label>
                    <Input
                      id="addressLine1"
                      value={accountData.addressLine1}
                      onChange={(e) => setAccountData({...accountData, addressLine1: e.target.value})}
                      required
                    />
                  </div>

                  <div>
                    <Label htmlFor="addressLine2">Apartment, Suite, etc. (optional)</Label>
                    <Input
                      id="addressLine2"
                      value={accountData.addressLine2}
                      onChange={(e) => setAccountData({...accountData, addressLine2: e.target.value})}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="city">City</Label>
                      <Input
                        id="city"
                        value={accountData.city}
                        onChange={(e) => setAccountData({...accountData, city: e.target.value})}
                        required
                      />
                    </div>
                    <div>
                      <Label htmlFor="state">State</Label>
                      <Input
                        id="state"
                        maxLength={2}
                        placeholder="CA"
                        value={accountData.state}
                        onChange={(e) => setAccountData({...accountData, state: e.target.value.toUpperCase()})}
                        required
                      />
                    </div>
                  </div>

                  <div>
                    <Label htmlFor="postalCode">ZIP Code</Label>
                    <Input
                      id="postalCode"
                      pattern="[0-9]{5}"
                      placeholder="12345"
                      value={accountData.postalCode}
                      onChange={(e) => setAccountData({...accountData, postalCode: e.target.value})}
                      required
                    />
                  </div>

                  <Button type="submit" className="w-full" disabled={loading}>
                    {loading ? 'Creating Account...' : 'Continue to Bank Account'}
                  </Button>
                </form>
              </CardContent>
            </Card>
          )}

          {/* Step 2: Bank Account */}
          {step === 'bank' && (
            <Card>
              <CardHeader>
                <CardTitle>Add Your Bank Account</CardTitle>
                <CardDescription>
                  Link your bank account for ACH transfers with no processing fees
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={(e) => { e.preventDefault(); addBankAccount(); }} className="space-y-4">
                  <div>
                    <Label htmlFor="routingNumber">Routing Number</Label>
                    <Input
                      id="routingNumber"
                      pattern="[0-9]{9}"
                      maxLength={9}
                      placeholder="123456789"
                      value={bankData.routingNumber}
                      onChange={(e) => setBankData({...bankData, routingNumber: e.target.value})}
                      required
                    />
                    <p className="text-xs text-gray-500 mt-1">9-digit routing number</p>
                  </div>

                  <div>
                    <Label htmlFor="accountNumber">Account Number</Label>
                    <Input
                      id="accountNumber"
                      type="text"
                      value={bankData.accountNumber}
                      onChange={(e) => setBankData({...bankData, accountNumber: e.target.value})}
                      required
                    />
                  </div>

                  <div>
                    <Label htmlFor="accountType">Account Type</Label>
                    <select
                      id="accountType"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md"
                      value={bankData.accountType}
                      onChange={(e) => setBankData({...bankData, accountType: e.target.value as 'checking' | 'savings'})}
                    >
                      <option value="checking">Checking</option>
                      <option value="savings">Savings</option>
                    </select>
                  </div>

                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <h4 className="font-medium text-blue-900 mb-2">What happens next?</h4>
                    <ul className="text-sm text-blue-800 space-y-1">
                      <li>• We'll send two small deposits to verify your account</li>
                      <li>• Deposits will appear in 1-2 business days</li>
                      <li>• You'll enter the amounts to complete verification</li>
                    </ul>
                  </div>

                  <Button type="submit" className="w-full" disabled={loading}>
                    {loading ? 'Adding Bank Account...' : 'Add Bank Account'}
                  </Button>
                </form>
              </CardContent>
            </Card>
          )}

          {/* Step 3: Verify Micro-Deposits */}
          {step === 'verify' && (
            <Card>
              <CardHeader>
                <CardTitle>Verify Your Bank Account</CardTitle>
                <CardDescription>
                  Enter the two small deposit amounts we sent to your bank account
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={(e) => { e.preventDefault(); verifyMicroDeposits(); }} className="space-y-4">
                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
                    <h4 className="font-medium text-yellow-900 mb-2">Check your bank account</h4>
                    <p className="text-sm text-yellow-800">
                      We've sent two small deposits (less than $1.00 each) to your bank account. 
                      They should appear within 1-2 business days with the description "MOOV VERIFICATION".
                    </p>
                  </div>

                  <div>
                    <Label htmlFor="amount1">First Deposit Amount</Label>
                    <Input
                      id="amount1"
                      type="number"
                      step="0.01"
                      min="0.01"
                      max="0.99"
                      placeholder="0.00"
                      value={microDeposits.amount1}
                      onChange={(e) => setMicroDeposits({...microDeposits, amount1: e.target.value})}
                      required
                    />
                  </div>

                  <div>
                    <Label htmlFor="amount2">Second Deposit Amount</Label>
                    <Input
                      id="amount2"
                      type="number"
                      step="0.01"
                      min="0.01"
                      max="0.99"
                      placeholder="0.00"
                      value={microDeposits.amount2}
                      onChange={(e) => setMicroDeposits({...microDeposits, amount2: e.target.value})}
                      required
                    />
                  </div>

                  <Button type="submit" className="w-full" disabled={loading}>
                    {loading ? 'Verifying...' : 'Verify Bank Account'}
                  </Button>

                  <p className="text-xs text-gray-500 text-center">
                    Haven't received the deposits yet? They typically appear within 1-2 business days.
                  </p>
                </form>
              </CardContent>
            </Card>
          )}

          {/* Step 4: Complete */}
          {step === 'complete' && (
            <Card>
              <CardHeader>
                <CardTitle>Setup Complete!</CardTitle>
                <CardDescription>
                  Your bank account has been successfully verified and is ready for ACH payments
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                    <div className="flex items-start">
                      <CheckCircle className="w-6 h-6 text-green-600 mr-3 flex-shrink-0 mt-0.5" />
                      <div>
                        <h3 className="font-medium text-green-900 mb-2">You're all set!</h3>
                        <ul className="text-sm text-green-800 space-y-1">
                          <li>✓ Identity verified</li>
                          <li>✓ Bank account added</li>
                          <li>✓ Micro-deposits verified</li>
                          <li>✓ Ready for ACH payments with no fees</li>
                        </ul>
                      </div>
                    </div>
                  </div>

                  <Button 
                    onClick={() => router.push('/tenant/payment-methods')}
                    className="w-full"
                    size="lg"
                  >
                    Go to Payment Methods
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </main>
    </div>
  )
}
