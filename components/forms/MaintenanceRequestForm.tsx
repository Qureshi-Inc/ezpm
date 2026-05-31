'use client'

/**
 * MaintenanceRequestForm — tenant-side "report an issue" form.
 * Submits multipart/form-data (title, category, priority, description, photos)
 * to POST /api/tenant/maintenance, then routes to the request list.
 */

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { FileDropzone } from '@/components/forms/FileDropzone'
import { CATEGORY_OPTIONS } from '@/components/maintenance/meta'
import { AlertCircle, Loader2 } from 'lucide-react'

export function MaintenanceRequestForm() {
  const router = useRouter()
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState('other')
  const [priority, setPriority] = useState('normal')
  const [description, setDescription] = useState('')
  const [photos, setPhotos] = useState<File[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!title.trim()) {
      setError('Please add a short title so we know what the issue is.')
      return
    }
    setSubmitting(true)
    try {
      const fd = new FormData()
      fd.set('title', title.trim())
      fd.set('category', category)
      fd.set('priority', priority)
      fd.set('description', description.trim())
      for (const p of photos) fd.append('photos', p)

      const res = await fetch('/api/tenant/maintenance', { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Could not submit your request.')
        setSubmitting(false)
        return
      }
      router.push('/tenant/maintenance')
      router.refresh()
    } catch {
      setError('Network error — please try again.')
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="title">What&rsquo;s the issue?</Label>
        <Input
          id="title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Kitchen sink is leaking"
          maxLength={200}
          disabled={submitting}
          autoFocus
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="category">Category</Label>
          <Select value={category} onValueChange={setCategory} disabled={submitting}>
            <SelectTrigger id="category">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CATEGORY_OPTIONS.map((c) => (
                <SelectItem key={c.value} value={c.value}>
                  {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="priority">Priority</Label>
          <Select value={priority} onValueChange={setPriority} disabled={submitting}>
            <SelectTrigger id="priority">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="normal">Normal</SelectItem>
              <SelectItem value="urgent">Urgent</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">Details (optional)</Label>
        <textarea
          id="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          disabled={submitting}
          rows={4}
          placeholder="When did it start? Anything that helps us fix it faster."
          className="flex w-full rounded-xl border border-input bg-card px-3.5 py-2.5 text-sm shadow-soft transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/30 disabled:opacity-50"
        />
      </div>

      <div className="space-y-2">
        <Label>Photos (optional)</Label>
        <FileDropzone value={photos} onChange={setPhotos} disabled={submitting} />
      </div>

      <div className="flex gap-3 pt-1">
        <Button type="submit" disabled={submitting} className="flex-1 sm:flex-none">
          {submitting ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Submitting…
            </>
          ) : (
            'Submit request'
          )}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => router.push('/tenant/maintenance')}
          disabled={submitting}
        >
          Cancel
        </Button>
      </div>
    </form>
  )
}
