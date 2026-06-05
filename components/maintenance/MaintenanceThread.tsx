'use client'

/**
 * MaintenanceThread — two-way updates thread on a maintenance request.
 * Used by both the tenant and admin request-detail pages. Posts comments
 * (+ optional photos) to /api/maintenance/[id]/comments.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { formatDate } from '@/utils/helpers'
import { Send, Paperclip, Loader2, X } from 'lucide-react'

interface Attachment {
  id: string
  file_name: string
  content_type: string
}
interface Comment {
  id: string
  author_role: 'tenant' | 'admin'
  body: string
  created_at: string
  attachments: Attachment[]
}
interface Original {
  body: string
  created_at: string | null
  attachments: Attachment[]
}

export function MaintenanceThread({ requestId, viewerRole }: { requestId: string; viewerRole: 'tenant' | 'admin' }) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [comments, setComments] = useState<Comment[]>([])
  const [original, setOriginal] = useState<Original | null>(null)
  const [loading, setLoading] = useState(true)
  const [body, setBody] = useState('')
  const [photos, setPhotos] = useState<File[]>([])
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/maintenance/${requestId}/comments`, { cache: 'no-store' })
      const data = await res.json()
      if (res.ok) {
        setComments(data.comments ?? [])
        setOriginal(data.original ?? null)
      }
    } catch {
      /* ignore */
    } finally {
      setLoading(false)
    }
  }, [requestId])

  useEffect(() => {
    load()
  }, [load])

  const send = async () => {
    if (!body.trim() && photos.length === 0) return
    setSending(true)
    setError('')
    try {
      const fd = new FormData()
      fd.set('body', body.trim())
      for (const p of photos) fd.append('photos', p)
      const res = await fetch(`/api/maintenance/${requestId}/comments`, { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Could not post.')
        return
      }
      setBody('')
      setPhotos([])
      if (fileRef.current) fileRef.current.value = ''
      setComments((c) => [...c, data.comment])
    } catch {
      setError('Network error — please try again.')
    } finally {
      setSending(false)
    }
  }

  const authorLabel = (role: 'tenant' | 'admin') => {
    if (role === viewerRole) return 'You'
    return role === 'admin' ? 'Property manager' : 'Tenant'
  }

  const AttachmentGrid = ({ atts }: { atts: Attachment[] }) =>
    atts.length > 0 ? (
      <div className="mt-2 flex flex-wrap gap-2">
        {atts.map((a) =>
          a.content_type.startsWith('image/') ? (
            <a key={a.id} href={`/api/tenant/maintenance/attachments/${a.id}`} target="_blank" rel="noopener noreferrer">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/api/tenant/maintenance/attachments/${a.id}`}
                alt={a.file_name}
                className="h-20 w-20 rounded-lg object-cover"
              />
            </a>
          ) : (
            <a
              key={a.id}
              href={`/api/tenant/maintenance/attachments/${a.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs underline"
            >
              {a.file_name}
            </a>
          ),
        )}
      </div>
    ) : null

  const hasOriginal = !!original && (original.attachments.length > 0 || !!original.body.trim())

  return (
    <div className="space-y-4">
      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : !hasOriginal && comments.length === 0 ? (
        <p className="text-sm text-muted-foreground">No updates yet. Start the conversation below.</p>
      ) : (
        <div className="space-y-3">
          {hasOriginal && original && (
            <div className={`flex ${viewerRole === 'tenant' ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[85%] rounded-2xl px-4 py-2.5 ${
                  viewerRole === 'tenant' ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground'
                }`}
              >
                <p
                  className={`text-xs font-medium ${
                    viewerRole === 'tenant' ? 'text-primary-foreground/80' : 'text-muted-foreground'
                  }`}
                >
                  {authorLabel('tenant')} · Original request{original.created_at ? ` · ${formatDate(original.created_at)}` : ''}
                </p>
                {original.body.trim() && <p className="mt-0.5 whitespace-pre-wrap text-sm">{original.body}</p>}
                <AttachmentGrid atts={original.attachments} />
              </div>
            </div>
          )}
          {comments.map((c) => {
            const mine = c.author_role === viewerRole
            return (
              <div key={c.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-2.5 ${
                    mine ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground'
                  }`}
                >
                  <p className={`text-xs font-medium ${mine ? 'text-primary-foreground/80' : 'text-muted-foreground'}`}>
                    {authorLabel(c.author_role)} · {formatDate(c.created_at)}
                  </p>
                  {c.body && c.body !== '(photo)' && <p className="mt-0.5 whitespace-pre-wrap text-sm">{c.body}</p>}
                  <AttachmentGrid atts={c.attachments} />
                </div>
              </div>
            )
          })}
        </div>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="rounded-xl border border-border bg-card p-3 space-y-2">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={2}
          disabled={sending}
          placeholder="Write an update…"
          className="flex w-full resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/30 disabled:opacity-50"
        />
        {photos.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {photos.map((p, i) => (
              <span key={i} className="inline-flex items-center gap-1 rounded-lg bg-muted px-2 py-1 text-xs">
                {p.name.slice(0, 18)}
                <button type="button" onClick={() => setPhotos((x) => x.filter((_, j) => j !== i))} aria-label="Remove">
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>
        )}
        <div className="flex items-center justify-between">
          <label className="inline-flex cursor-pointer items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
            <Paperclip className="w-4 h-4" />
            Photo
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/heic,application/pdf"
              multiple
              className="hidden"
              disabled={sending}
              onChange={(e) => setPhotos(Array.from(e.target.files ?? []))}
            />
          </label>
          <Button size="sm" onClick={send} disabled={sending || (!body.trim() && photos.length === 0)}>
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            Send
          </Button>
        </div>
      </div>
    </div>
  )
}
