'use client'

import { useState } from 'react'
import { Loader2 } from 'lucide-react'

interface Props {
  initialMaintenanceReplies: boolean
}

export function NotificationSettings({ initialMaintenanceReplies }: Props) {
  const [maintReplies, setMaintReplies] = useState(initialMaintenanceReplies)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const toggle = async (next: boolean) => {
    setSaving(true)
    setError('')
    const prev = maintReplies
    setMaintReplies(next) // optimistic
    try {
      const res = await fetch('/api/tenant/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notify_maintenance_replies: next }),
      })
      if (!res.ok) {
        setMaintReplies(prev) // revert
        const data = await res.json().catch(() => ({}))
        setError(data.error || 'Could not save. Try again.')
      }
    } catch {
      setMaintReplies(prev)
      setError('Network error — please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex items-center justify-between gap-4 rounded-xl border border-border bg-card p-4">
        <div className="min-w-0">
          <p className="font-medium text-foreground">Maintenance replies</p>
          <p className="text-sm text-muted-foreground">
            Email me when my property manager replies to a maintenance request.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={maintReplies}
          disabled={saving}
          onClick={() => toggle(!maintReplies)}
          className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:opacity-60 ${
            maintReplies ? 'bg-primary' : 'bg-muted-foreground/30'
          }`}
        >
          <span
            className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
              maintReplies ? 'translate-x-5' : 'translate-x-1'
            }`}
          />
          {saving && <Loader2 className="absolute -right-6 h-4 w-4 animate-spin text-muted-foreground" />}
        </button>
      </div>
    </div>
  )
}
