'use client'

/**
 * DocumentsManager — shared documents UI for both sides of the per-tenant
 * folder. In 'tenant' mode it talks to /api/tenant/documents (the logged-in
 * tenant's own folder); in 'admin' mode it talks to
 * /api/admin/tenants/[tenantId]/documents. Both render the same list.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { DOC_CATEGORIES, docCategoryLabel, formatBytes, FileGlyph } from '@/components/documents/meta'
import { formatDate } from '@/utils/helpers'
import { UploadCloud, Download, Trash2, AlertCircle, Loader2 } from 'lucide-react'

interface DocItem {
  id: string
  category: string
  file_name: string
  content_type: string
  size_bytes: number
  uploaded_by_role: 'tenant' | 'admin'
  created_at: string
}

interface Props {
  mode: 'tenant' | 'admin'
  tenantId?: string
}

const ACCEPT =
  'application/pdf,image/jpeg,image/png,image/webp,image/heic,application/msword,' +
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document,' +
  'application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,' +
  'text/plain,text/csv'

export function DocumentsManager({ mode, tenantId }: Props) {
  const listUrl = mode === 'admin' ? `/api/admin/tenants/${tenantId}/documents` : '/api/tenant/documents'
  const uploadUrl = listUrl
  const deleteUrl = (id: string) =>
    mode === 'admin' ? `/api/admin/documents/${id}` : `/api/tenant/documents/${id}`

  const fileRef = useRef<HTMLInputElement>(null)
  const [docs, setDocs] = useState<DocItem[]>([])
  const [loading, setLoading] = useState(true)
  const [category, setCategory] = useState('other')
  const [picked, setPicked] = useState<File[]>([])
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    try {
      const res = await fetch(listUrl)
      const data = await res.json()
      if (res.ok) setDocs(data.documents ?? [])
    } catch {
      /* ignore */
    } finally {
      setLoading(false)
    }
  }, [listUrl])

  useEffect(() => {
    load()
  }, [load])

  const handleUpload = async () => {
    if (picked.length === 0) {
      setError('Choose a file first.')
      return
    }
    setUploading(true)
    setError('')
    try {
      const fd = new FormData()
      fd.set('category', category)
      for (const f of picked) fd.append('documents', f)
      const res = await fetch(uploadUrl, { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Upload failed.')
        return
      }
      setPicked([])
      if (fileRef.current) fileRef.current.value = ''
      await load()
    } catch {
      setError('Network error — please try again.')
    } finally {
      setUploading(false)
    }
  }

  const handleDelete = async (doc: DocItem) => {
    if (!confirm(`Delete "${doc.file_name}"? This can't be undone.`)) return
    setError('')
    const res = await fetch(deleteUrl(doc.id), { method: 'DELETE' })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setError(data.error || 'Could not delete.')
      return
    }
    setDocs((d) => d.filter((x) => x.id !== doc.id))
  }

  const canDelete = (doc: DocItem) => mode === 'admin' || doc.uploaded_by_role === 'tenant'
  const uploaderLabel = (doc: DocItem) => {
    if (mode === 'admin') return doc.uploaded_by_role === 'admin' ? 'You' : 'Tenant'
    return doc.uploaded_by_role === 'tenant' ? 'You' : 'Property manager'
  }

  return (
    <div className="space-y-5">
      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Upload row */}
      <div className="rounded-xl border border-border bg-muted/40 p-4 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3 sm:items-end">
          <div className="space-y-1.5">
            <Label>Category</Label>
            <Select value={category} onValueChange={setCategory} disabled={uploading}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DOC_CATEGORIES.map((c) => (
                  <SelectItem key={c.value} value={c.value}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={handleUpload} disabled={uploading || picked.length === 0}>
            {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <UploadCloud className="w-4 h-4" />}
            {uploading ? 'Uploading…' : 'Upload'}
          </Button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept={ACCEPT}
          multiple
          disabled={uploading}
          onChange={(e) => setPicked(Array.from(e.target.files ?? []))}
          className="block w-full text-sm text-muted-foreground file:mr-3 file:rounded-lg file:border-0 file:bg-primary file:px-3 file:py-2 file:text-sm file:font-medium file:text-primary-foreground hover:file:opacity-90"
        />
        <p className="text-xs text-muted-foreground">PDF, images, Word, Excel, TXT, CSV · up to 25 MB each</p>
      </div>

      {/* List */}
      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : docs.length === 0 ? (
        <p className="text-sm text-muted-foreground">No documents yet.</p>
      ) : (
        <div className="space-y-2">
          {docs.map((doc) => (
            <div
              key={doc.id}
              className="flex items-center gap-3 rounded-xl border border-border bg-card p-3"
            >
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                <FileGlyph contentType={doc.content_type} className="w-5 h-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-foreground">{doc.file_name}</p>
                <p className="text-xs text-muted-foreground">
                  {docCategoryLabel(doc.category)} · {formatBytes(doc.size_bytes)} · {uploaderLabel(doc)} ·{' '}
                  {formatDate(doc.created_at)}
                </p>
              </div>
              <a
                href={`/api/documents/${doc.id}/file`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label={`Download ${doc.file_name}`}
              >
                <Download className="w-4 h-4" />
              </a>
              {canDelete(doc) && (
                <button
                  type="button"
                  onClick={() => handleDelete(doc)}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  aria-label={`Delete ${doc.file_name}`}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
