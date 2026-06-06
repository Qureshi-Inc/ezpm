'use client'

import { useState } from 'react'
import { Loader2 } from 'lucide-react'

interface Props {
  initialMaintenanceReplies: boolean
  initialMaintenanceStatus: boolean
  initialPaymentCharged: boolean
  initialSms: boolean
  phone: string | null
}

export function NotificationSettings({
  initialMaintenanceReplies,
  initialMaintenanceStatus,
  initialPaymentCharged,
  initialSms,
  phone,
}: Props) {
  const [prefs, setPrefs] = useState({
    notify_maintenance_replies: initialMaintenanceReplies,
    notify_maintenance_status: initialMaintenanceStatus,
    notify_payment_charged: initialPaymentCharged,
    notify_sms: initialSms,
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
      key: 'notify_maintenance_status',
      title: 'Maintenance status updates',
      desc: 'Email me when a maintenance request changes status (in progress, resolved, cancelled).',
    },
    {
      key: 'notify_maintenance_replies',
      title: 'Maintenance replies',
      desc: 'Email me when my property manager replies to a maintenance request.',
    },
    {
      key: 'notify_payment_charged',
      title: 'Payment updates',
      desc: 'Email me when my rent is charged — a receipt for card payments, or an “on its way” note with the clearing ETA for bank payments.',
    },
    {
      key: 'notify_sms',
      title: 'Text message alerts',
      desc: phone
        ? `Also text me maintenance updates at ${phone}. Message & data rates may apply.`
        : 'Also text me maintenance updates. Ask your property manager to add a phone number to enable this.',
    },
  ]

  return (
    <div className="space-y-3">
      {error && <p className="text-sm text-destructive">{error}</p>}
      {ROWS.map((row) => {
        const on = prefs[row.key]
        // SMS can't be enabled without a phone number on file.
        const locked = row.key === 'notify_sms' && !phone
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
              aria-checked={on && !locked}
              aria-label={row.title}
              disabled={saving || locked}
              onClick={() => toggle(row.key, !on)}
              className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:opacity-60 disabled:cursor-not-allowed ${
                on && !locked ? 'bg-primary' : 'bg-muted-foreground/30'
              }`}
            >
              <span
                className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                  on && !locked ? 'translate-x-5' : 'translate-x-1'
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
