'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { AlertCircle, Plus, RefreshCw } from 'lucide-react'

export function GeneratePaymentsButton() {
  const router = useRouter()
  const [isGenerating, setIsGenerating] = useState(false)
  const [isCheckingMissing, setIsCheckingMissing] = useState(false)
  const [isDebugging, setIsDebugging] = useState(false)
  const [isProcessingAutoPay, setIsProcessingAutoPay] = useState(false)
  const [result, setResult] = useState<string>('')
  const [debugResult, setDebugResult] = useState<string>('')
  const [error, setError] = useState('')

  const handleGeneratePayments = async () => {
    setIsGenerating(true)
    setError('')
    setResult('')
    setDebugResult('')

    try {
      const response = await fetch('/api/admin/payments/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          monthsAhead: 1 // Generate current month's payments
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to generate payments')
      }

      setResult(data.message)
      
      // Refresh the page to show new payments
      setTimeout(() => {
        router.refresh()
        setResult('')
      }, 3000)

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate payments')
    } finally {
      setIsGenerating(false)
    }
  }

  const handleCheckMissingPayments = async () => {
    setIsCheckingMissing(true)
    setError('')
    setResult('')
    setDebugResult('')

    try {
      const response = await fetch('/api/admin/payments/check-missing', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to check missing payments')
      }

      let resultMessage = data.message
      
      // Add error details if there are any
      if (data.errorDetails && data.errorDetails.length > 0) {
        resultMessage += '\n\nErrors:\n' + data.errorDetails.map((err: any) => 
          `• ${err.tenantName}: ${err.error}`
        ).join('\n')
      }
      
      setResult(resultMessage)
      
      // Refresh the page to show new payments
      setTimeout(() => {
        router.refresh()
        setResult('')
      }, 4000)

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to check missing payments')
    } finally {
      setIsCheckingMissing(false)
    }
  }

  const handleDebugTenants = async () => {
    setIsDebugging(true)
    setError('')
    setDebugResult('')

    try {
      const response = await fetch('/api/admin/tenants/debug', {
        method: 'GET',
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to debug tenants')
      }

      const debugInfo = data.tenants.map((tenant: any) => {
        const issues = []
        if (!tenant.property_id) issues.push('No property assigned')
        if (!tenant.property?.rent_amount) issues.push('No rent amount set')
        if (!tenant.payment_due_day) issues.push('No payment due day set')
        
        return `${tenant.first_name} ${tenant.last_name}:
  - Email: ${tenant.user?.email}
  - Property: ${tenant.property?.address || 'Not assigned'}
  - Rent: $${tenant.property?.rent_amount || 'Not set'}
  - Payment Due Day: ${tenant.payment_due_day || 'Not set'}
  - Recent Payments: ${tenant.recentPayments.length}
  - Issues: ${issues.length ? issues.join(', ') : 'None'}`
      }).join('\n\n')

      setDebugResult(`Debug Info (Today: ${data.currentDate}):\n\n${debugInfo}`)

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to debug tenants')
    } finally {
      setIsDebugging(false)
    }
  }

  const handleProcessAutoPay = async () => {
    setIsProcessingAutoPay(true)
    setError('')
    setResult('')
    setDebugResult('')

    try {
      const response = await fetch('/api/admin/auto-pay/process', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to process auto payments')
      }

      let resultMessage = data.message + '\n\n'
      resultMessage += `Processed: ${data.processed}\n`
      resultMessage += `Skipped: ${data.skipped}\n`
      resultMessage += `Failed: ${data.failed}\n`
      
      if (data.details && data.details.length > 0) {
        resultMessage += '\nDetails:\n' + data.details.map((detail: any) => 
          `• ${detail.tenantName}: ${detail.status}${detail.reason ? ` (${detail.reason})` : ''}${detail.amount ? ` - $${detail.amount}` : ''}`
        ).join('\n')
      }
      
      setResult(resultMessage)
      
      // Refresh the page to show updated payments
      setTimeout(() => {
        router.refresh()
        setResult('')
      }, 5000)

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to process auto payments')
    } finally {
      setIsProcessingAutoPay(false)
    }
  }

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-medium text-gray-900">Admin Controls</h3>
      
      {/* Mobile: Stacked, Desktop: Horizontal */}
      <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
        <Button 
          onClick={handleCheckMissingPayments}
          disabled={isCheckingMissing || isGenerating || isDebugging}
          variant="default"
          className="flex items-center justify-center space-x-2 w-full sm:w-auto"
        >
          {isCheckingMissing ? (
            <>
              <RefreshCw className="w-4 h-4 animate-spin" />
              <span>Checking...</span>
            </>
          ) : (
            <>
              <Plus className="w-4 h-4" />
              <span>Check & Generate Missing</span>
            </>
          )}
        </Button>
        
        <Button 
          onClick={handleDebugTenants}
          disabled={isDebugging || isGenerating || isCheckingMissing}
          variant="secondary"
          className="flex items-center justify-center space-x-2 w-full sm:w-auto"
        >
          {isDebugging ? (
            <>
              <RefreshCw className="w-4 h-4 animate-spin" />
              <span>Debugging...</span>
            </>
          ) : (
            <>
              <AlertCircle className="w-4 h-4" />
              <span>Debug Tenants</span>
            </>
          )}
        </Button>
        
        <Button 
          onClick={handleProcessAutoPay}
          disabled={isProcessingAutoPay || isGenerating || isCheckingMissing || isDebugging}
          variant="secondary"
          className="flex items-center justify-center space-x-2 w-full sm:w-auto"
        >
          {isProcessingAutoPay ? (
            <>
              <RefreshCw className="w-4 h-4 animate-spin" />
              <span>Processing...</span>
            </>
          ) : (
            <>
              <RefreshCw className="w-4 h-4" />
              <span>Process Auto Pay</span>
            </>
          )}
        </Button>
        
        <Button 
          onClick={handleGeneratePayments}
          disabled={isGenerating || isCheckingMissing || isDebugging || isProcessingAutoPay}
          variant="outline"
          className="flex items-center justify-center space-x-2 w-full sm:w-auto"
          title="Force generate future payments (usually not needed - payments auto-generate within 5 days of due date)"
        >
          {isGenerating ? (
            <>
              <RefreshCw className="w-4 h-4 animate-spin" />
              <span>Generating...</span>
            </>
          ) : (
            <>
              <Plus className="w-4 h-4" />
              <span>Force Future (Testing)</span>
            </>
          )}
        </Button>
      </div>

      {result && (
        <div className="p-3 text-sm text-green-600 bg-green-50 border border-green-200 rounded-lg whitespace-pre-line">
          {result}
        </div>
      )}

      {debugResult && (
        <div className="p-3 text-xs text-gray-700 bg-gray-50 border border-gray-200 rounded-lg whitespace-pre-line font-mono max-h-64 overflow-y-auto">
          {debugResult}
        </div>
      )}

      {error && (
        <div className="p-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg flex items-center space-x-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <Card className="border-blue-200 bg-blue-50">
        <CardContent className="pt-4">
          <div className="flex items-start space-x-3">
            <AlertCircle className="w-5 h-5 text-blue-600 mt-0.5" />
            <div>
              <h4 className="font-medium text-blue-900">Payment Generation</h4>
              <p className="text-sm text-blue-800 mt-1">
                <strong>Check & Generate Missing:</strong> Finds tenants who should have pending payments and creates any missing payments automatically.<br/>
                <strong>Debug Tenants:</strong> Shows tenant configuration details and identifies setup issues.<br/>
                <strong>Process Auto Pay:</strong> Processes today's scheduled auto payments (skips if manual payments already made).<br/>
                <strong>Force Future:</strong> Creates future payments immediately (normally payments auto-generate within 5 days of due date).
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
} 