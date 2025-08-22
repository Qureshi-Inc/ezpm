'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'

function VerifyMicroDepositsContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [initiated, setInitiated] = useState(false)
  const [amount1, setAmount1] = useState('')
  const [amount2, setAmount2] = useState('')
  
  const bankAccountId = searchParams.get('bankAccountId')
  const moovAccountId = searchParams.get('accountId') // This is actually the Moov account ID
  const last4 = searchParams.get('last4')

  useEffect(() => {
    if (!bankAccountId || !moovAccountId) {
      setError('Missing required information. Please try adding your bank account again.')
    }
  }, [bankAccountId, moovAccountId])

  const handleVerification = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const requestBody = {
        moovAccountId,
        bankAccountId,
        amounts: [
          Math.round(parseFloat(amount1) * 100), // Convert to cents
          Math.round(parseFloat(amount2) * 100)  // Convert to cents
        ]
      }
      
      console.log('🔍 Sending verification request:', requestBody)
      console.log('📋 URL params:', { bankAccountId, moovAccountId, last4 })
      
      const response = await fetch('/api/tenant/payment-methods/verify-micro-deposits', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody)
      })

      const data = await response.json()
      console.log('📥 Verification response:', data)

      if (!response.ok) {
        throw new Error(data.error || 'Failed to verify micro-deposits')
      }

      // Handle case where micro-deposits were just initiated
      if (data.initiated) {
        setInitiated(true)
        setSuccess(true)
        setError('') // Clear any previous errors
        setTimeout(() => {
          router.push('/tenant/payment-methods')
        }, 5000) // Give more time to read the message
        return
      }

      // Handle successful verification
      if (data.verified && data.paymentMethod) {
        console.log('✅ Verification successful:', data)
        setInitiated(false)
        setSuccess(true)
        setError('')
        
        // Force refresh payment methods page
        setTimeout(() => {
          router.refresh() // Force Next.js to revalidate data
          router.push('/tenant/payment-methods')
        }, 2000)
        return
      }

      // Unexpected response
      console.error('❌ Unexpected verification response:', data)
      throw new Error('Unexpected verification response')
    } catch (err) {
      console.error('Verification error:', err)
      setError(err instanceof Error ? err.message : 'Failed to verify micro-deposits')
    } finally {
      setLoading(false)
    }
  }

  if (success) {
    return (
      <div className="container max-w-md mx-auto py-10">
        <Card>
          <CardContent className="pt-6">
            <Alert>
              <AlertDescription className="text-green-600">
                {initiated ? (
                  <>
                    ✓ Step 1 Complete: Micro-deposits Initiated! 
                    <br />
                    <span className="font-medium">Next Steps:</span>
                    <br />
                    1. Wait for deposits to arrive (1-2 minutes in test mode)
                    <br />
                    2. Return to payment methods and click "Verify Now" again
                    <br />
                    3. Enter the test amounts (0.00 and 0.00)
                    <br />
                    <br />
                    Redirecting to payment methods...
                  </>
                ) : (
                  <>
                    ✓ Bank account verified successfully!
                    <br />
                    Your bank account is now ready to use.
                    <br />
                    <br />
                    Redirecting to payment methods...
                  </>
                )}
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="container max-w-md mx-auto py-10">
      <Card>
        <CardHeader>
          <CardTitle>Verify Your Bank Account</CardTitle>
          <CardDescription>
            We've sent two small deposits to your bank account ending in {last4 || '****'}.
            Please enter the amounts below to verify your account.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <Alert>
            <AlertDescription>
              <strong>For Test Accounts:</strong> Enter 0.00 for both amounts
            </AlertDescription>
          </Alert>

          <form onSubmit={handleVerification} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="amount1">First Deposit Amount ($)</Label>
              <Input
                id="amount1"
                type="number"
                step="0.01"
                min="0"
                max="0.99"
                placeholder="0.00"
                value={amount1}
                onChange={(e) => setAmount1(e.target.value)}
                required
                disabled={loading}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="amount2">Second Deposit Amount ($)</Label>
              <Input
                id="amount2"
                type="number"
                step="0.01"
                min="0"
                max="0.99"
                placeholder="0.00"
                value={amount2}
                onChange={(e) => setAmount2(e.target.value)}
                required
                disabled={loading}
              />
            </div>

            <div className="flex gap-3">
              <Button
                type="submit"
                disabled={loading || !bankAccountId || !moovAccountId}
                className="flex-1"
              >
                {loading ? 'Verifying...' : 'Verify Account'}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => router.push('/tenant/payment-methods')}
                disabled={loading}
                className="flex-1"
              >
                Cancel
              </Button>
            </div>
          </form>

          <div className="text-sm text-gray-500 space-y-1">
            <p>• Deposits may take 1-2 business days to appear</p>
            <p>• Check your bank statement or online banking</p>
            <p>• You have 3 attempts to enter the correct amounts</p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

export default function VerifyMicroDepositsPage() {
  return (
    <Suspense fallback={
      <div className="container max-w-md mx-auto py-10">
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">Loading...</div>
          </CardContent>
        </Card>
      </div>
    }>
      <VerifyMicroDepositsContent />
    </Suspense>
  )
}
