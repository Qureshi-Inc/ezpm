'use client'

import { useState } from 'react'
import { Loader2 } from 'lucide-react'

interface Props {
  initialMaintenanceReplies: boolean
  initialPaymentReceipts: boolean
}

export function NotificationSettings({ initialMaintenanceReplies, initialPaymentReceipts }: Props) {
  const [prefs, setPrefs] = useState({
    notify_maintenance_replies: initialMaintenanceReplies,
    notify_payment_receipts: initialPaymentReceipts,
  })
  const [savingKey, setSavingKey] = useState<string>('')
  const [error, setError] = useState('')

  type PrefKey = keyof typeof prefs

  const toggle = async (key: PrefKey, next: boolean) => {
    setSavingKey(key)
    setError('')
    const prev = prefs[key]
    setPrefs((p) => ({ ...p, [key]: next })) // optimistic
    try {
      const res = await fetch('/api/tenant/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [key]: next }),
      })
      if (!res.ok) {
        setPrefs((p) => ({ ...p, [key]: prev })) // revert
        const data = await res.json().catch(() => ({}))
        setError(data.error || 'Could not save. Try again.')
      }
    } catch {
      setPrefs((p) => ({ ...p, [key]: prev }))
      setError('Network error — please try again.')
    } finally {
      setSavingKey('')
    }
  }

  const ROWS: { key: PrefKey; title: string; desc: string }[] = [
    {
      key: 'notify_maintenance_replies',
      title: 'Maintenance replies',
      desc: 'Email me when my property manager replies to a maintenance request.',
    },
    {
      key: 'notify_payment_receipts',
      title: 'Payment receipts',
      desc: 'Email me a receipt each time my rent payment goes through.',
    },
  ]

  return (
    <div className="space-y-3">
      {error && <p className="text-sm text-destructive">{error}</p>}
      {ROWS.map((row) => {
        const on = prefs[row.key]
        const saving = savingKey === row.key
        return (
          <div
            key={row.key}
            className="flex items-center justify-between gap-4 rounded-xl border border-border bg-card p-4"
          >
            <div className="min-w-0">
              <p className="font-medium text-foreground">{row.title}</p>
              <p className="text-sm text-muted-foreground">{row.desc}</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={on}
              aria-label={row.title}
              disabled={saving}
              onClick={() => toggle(row.key, !on)}
              className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:opacity-60 ${
                on ? 'bg-primary' : 'bg-muted-foreground/30'
              }`}
            >
              <span
                className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                  on ? 'translate-x-5' : 'translate-x-1'
                }`}
              />
              {saving && <Loader2 className="absolute -right-6 h-4 w-4 animate-spin text-muted-foreground" />}
            </button>
          </div>
        )
      })}
    </div>
  )
}
