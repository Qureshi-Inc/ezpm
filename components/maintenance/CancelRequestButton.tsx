'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Loader2 } from 'lucide-react'

/** Tenant-only: cancel an open request. */
export function CancelRequestButton({ requestId }: { requestId: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)

  const cancel = async () => {
    if (!confirm('Cancel this maintenance request?')) return
    setBusy(true)
    const res = await fetch(`/api/tenant/maintenance/${requestId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'cancel' }),
    })
    if (res.ok) {
      router.refresh()
    } else {
      setBusy(false)
      alert('Could not cancel the request.')
    }
  }

  return (
    <Button variant="outline" size="sm" onClick={cancel} disabled={busy}>
      {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Cancel request'}
    </Button>
  )
}
