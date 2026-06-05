'use client'

/**
 * Admin-only status control. Changing the status PATCHes the admin route, which
 * persists the change and emails the tenant. Refreshes the page on success.
 */

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Loader2 } from 'lucide-react'

const NEXT_ACTIONS: { status: string; label: string; variant?: 'default' | 'outline' }[] = [
  { status: 'in_progress', label: 'Mark in progress' },
  { status: 'resolved', label: 'Mark resolved' },
  { status: 'open', label: 'Reopen', variant: 'outline' },
  { status: 'cancelled', label: 'Cancel', variant: 'outline' },
]

export function StatusControl({ requestId, currentStatus }: { requestId: string; currentStatus: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState('')

  const setStatus = async (status: string) => {
    setBusy(status)
    setError('')
    const res = await fetch(`/api/admin/maintenance/${requestId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    if (res.ok) {
      router.refresh()
      setBusy(null)
    } else {
      const d = await res.json().catch(() => ({}))
      setError(d.error || 'Could not update status.')
      setBusy(null)
    }
  }

  // Only show transitions that make sense from the current status.
  const actions = NEXT_ACTIONS.filter((a) => a.status !== currentStatus)

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {actions.map((a) => (
          <Button
            key={a.status}
            size="sm"
            variant={a.variant ?? 'default'}
            onClick={() => setStatus(a.status)}
            disabled={!!busy}
          >
            {busy === a.status ? <Loader2 className="w-4 h-4 animate-spin" /> : a.label}
          </Button>
        ))}
      </div>
      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
    </div>
  )
}
