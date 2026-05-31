'use client'

import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { formatDate } from '@/utils/helpers'
import { Megaphone, Trash2, AlertCircle, Loader2, CheckCircle2 } from 'lucide-react'

interface Announcement {
  id: string
  title: string
  body: string
  created_at: string
}

export function AnnouncementsManager() {
  const [items, setItems] = useState<Announcement[]>([])
  const [loading, setLoading] = useState(true)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [emailToo, setEmailToo] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/announcements')
      const data = await res.json()
      if (res.ok) setItems(data.announcements ?? [])
    } catch {
      /* ignore */
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const publish = async () => {
    if (!title.trim() || !body.trim()) {
      setError('Add a title and a message.')
      return
    }
    setPublishing(true)
    setError('')
    setSuccess('')
    try {
      const res = await fetch('/api/admin/announcements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title.trim(), body: body.trim(), sendEmail: emailToo }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Could not publish.')
        return
      }
      setTitle('')
      setBody('')
      setSuccess(
        emailToo
          ? `Published and emailed to ${data.emailedCount} tenant${data.emailedCount === 1 ? '' : 's'}.`
          : 'Published.',
      )
      setEmailToo(false)
      setTimeout(() => setSuccess(''), 6000)
      await load()
    } catch {
      setError('Network error — please try again.')
    } finally {
      setPublishing(false)
    }
  }

  const remove = async (a: Announcement) => {
    if (!confirm(`Delete "${a.title}"?`)) return
    const res = await fetch(`/api/admin/announcements/${a.id}`, { method: 'DELETE' })
    if (res.ok) setItems((x) => x.filter((i) => i.id !== a.id))
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-border bg-card p-5 space-y-4 shadow-soft">
        {error && (
          <div className="flex items-start gap-2 rounded-xl border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
            <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}
        {success && (
          <div className="flex items-start gap-2 rounded-xl border border-success/30 bg-success/10 p-3 text-sm text-success">
            <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <span>{success}</span>
          </div>
        )}
        <div className="space-y-1.5">
          <Label htmlFor="ann-title">Title</Label>
          <Input
            id="ann-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Water shut-off this Friday 9–11am"
            maxLength={200}
            disabled={publishing}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ann-body">Message</Label>
          <textarea
            id="ann-body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={4}
            disabled={publishing}
            placeholder="What do your tenants need to know?"
            className="flex w-full rounded-xl border border-input bg-card px-3.5 py-2.5 text-sm shadow-soft transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/30 disabled:opacity-50"
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-foreground select-none">
          <input
            type="checkbox"
            checked={emailToo}
            onChange={(e) => setEmailToo(e.target.checked)}
            disabled={publishing}
            className="h-4 w-4 rounded border-input"
          />
          Also email every tenant
        </label>
        <Button onClick={publish} disabled={publishing}>
          {publishing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Megaphone className="w-4 h-4" />}
          {publishing ? 'Publishing…' : 'Publish announcement'}
        </Button>
      </div>

      <div className="space-y-3">
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground">No announcements yet.</p>
        ) : (
          items.map((a) => (
            <div key={a.id} className="rounded-2xl border border-border bg-card p-5 shadow-soft">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="font-medium text-foreground">{a.title}</h3>
                  <p className="text-xs text-muted-foreground">{formatDate(a.created_at)}</p>
                </div>
                <button
                  type="button"
                  onClick={() => remove(a)}
                  className="inline-flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  aria-label={`Delete ${a.title}`}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
              <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{a.body}</p>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
