'use client'

/**
 * AdminPaymentControls — debug + reconcile buttons for the admin payments page.
 *
 * Post-Stripe-Subscriptions migration, the old "generate payments" /
 * "check missing" / "process auto-pay" buttons are gone (Stripe runs the
 * schedule). What remains is useful: see tenant Zitadel/Stripe link
 * status, and force-run the events catchup if you suspect the local
 * mirror is behind.
 *
 * The component keeps its existing import path (named GeneratePaymentsButton)
 * so the admin payments page doesn't need updating.
 */

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { AlertCircle, RefreshCw, BadgeInfo } from 'lucide-react'

interface ReconcileResult {
  processed: number
  skipped: number
  unhandled: number
  highestSeenAt: number
  watermarkUpdated: boolean
  since: number
}

export function GeneratePaymentsButton() {
  const router = useRouter()
  const [isDebugging, setIsDebugging] = useState(false)
  const [isReconciling, setIsReconciling] = useState(false)
  const [debugResult, setDebugResult] = useState('')
  const [reconcileResult, setReconcileResult] = useState('')
  const [error, setError] = useState('')

  const handleDebugTenants = async () => {
    setIsDebugging(true)
    setError('')
    setDebugResult('')
    try {
      const response = await fetch('/api/admin/tenants/debug')
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Failed to debug tenants')

      const debugInfo = (data.tenants ?? [])
        .map((t: Record<string, unknown>) => {
          const issues: string[] = []
          if (!t.user_id) issues.push('not yet linked to Zitadel user')
          if (!t.stripe_customer_id) issues.push('no Stripe Customer')
          if (!t.stripe_subscription_id) issues.push('no active Subscription')
          if (!t.property_id) issues.push('no property assigned')
          return `${t.first_name} ${t.last_name}
  email: ${t.email}
  property: ${(t as any).property?.address || 'unassigned'}
  rent: ${(t as any).property?.rent_amount ? `$${(t as any).property.rent_amount}` : 'n/a'}
  due day: ${t.payment_due_day}
  Zitadel user: ${t.user_id || '— not linked'}
  Stripe customer: ${t.stripe_customer_id || '— not yet'}
  Stripe subscription: ${t.stripe_subscription_id || '— none'}
  recent payments: ${(t as any).recentPayments?.length ?? 0}
  issues: ${issues.length ? issues.join(', ') : 'none'}`
        })
        .join('\n\n')
      setDebugResult(`Today: ${data.currentDate}\n\n${debugInfo || '(no tenants)'}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to debug tenants')
    } finally {
      setIsDebugging(false)
    }
  }

  const handleReconcile = async () => {
    setIsReconciling(true)
    setError('')
    setReconcileResult('')
    try {
      const response = await fetch('/api/admin/stripe-reconcile', { method: 'POST' })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Reconcile failed')
      const r = data.result as ReconcileResult
      setReconcileResult(
        `processed: ${r.processed}\nalready-seen: ${r.skipped}\nunhandled: ${r.unhandled}\nwatermark: ${new Date(r.highestSeenAt * 1000).toISOString()}${r.watermarkUpdated ? ' (updated)' : ''}`,
      )
      setTimeout(() => router.refresh(), 1500)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Reconcile failed')
    } finally {
      setIsReconciling(false)
    }
  }

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-medium text-foreground">Admin Controls</h3>

      <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
        <Button
          onClick={handleDebugTenants}
          disabled={isDebugging || isReconciling}
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
              <BadgeInfo className="w-4 h-4" />
              <span>Debug tenants</span>
            </>
          )}
        </Button>

        <Button
          onClick={handleReconcile}
          disabled={isReconciling || isDebugging}
          variant="default"
          className="flex items-center justify-center space-x-2 w-full sm:w-auto"
          title="Replay Stripe events since the last successful sync. Useful after server downtime."
        >
          {isReconciling ? (
            <>
              <RefreshCw className="w-4 h-4 animate-spin" />
              <span>Reconciling...</span>
            </>
          ) : (
            <>
              <RefreshCw className="w-4 h-4" />
              <span>Run Stripe reconcile</span>
            </>
          )}
        </Button>
      </div>

      {reconcileResult && (
        <div className="p-3 text-xs text-success bg-success/10 border border-success/30 rounded-lg whitespace-pre-line font-mono">
          {reconcileResult}
        </div>
      )}

      {debugResult && (
        <div className="p-3 text-xs text-foreground bg-muted border border-border rounded-lg whitespace-pre-line font-mono max-h-96 overflow-y-auto">
          {debugResult}
        </div>
      )}

      {error && (
        <div className="p-3 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-lg flex items-center space-x-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <Card className="border-primary/20 bg-accent">
        <CardContent className="pt-4">
          <div className="flex items-start space-x-3">
            <AlertCircle className="w-5 h-5 text-primary mt-0.5" />
            <div>
              <h4 className="font-medium text-accent-foreground">About these controls</h4>
              <p className="text-sm text-accent-foreground mt-1">
                <strong>Debug tenants:</strong> shows which tenants still need a Zitadel invite, a Stripe Customer, or a Subscription.<br />
                <strong>Run Stripe reconcile:</strong> replays Stripe events since the last successful sync. Run this after server downtime to catch any missed webhooks.
              </p>
              <p className="text-xs text-primary mt-2">
                Routine monthly charges happen on Stripe&apos;s side (Subscriptions). You don&apos;t need to push a button for tenants to be billed.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
