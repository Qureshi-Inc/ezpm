'use client'

/**
 * FileDropzone — mobile-first photo/PDF picker for maintenance requests.
 *
 * - On mobile, the input opens the camera (capture="environment"); on desktop,
 *   click-to-browse + drag-and-drop.
 * - Multi-file with thumbnail previews and per-file remove.
 * - Client-side validation (type + size + count) for fast UX feedback. The
 *   server re-validates everything — these checks are NOT the security boundary.
 *
 * Controlled: parent owns the File[] via value/onChange.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { UploadCloud, X, FileText } from 'lucide-react'

const ACCEPT = 'image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf'
const MAX_BYTES = 10 * 1024 * 1024
const MAX_FILES = 6
const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf'])

interface FileDropzoneProps {
  value: File[]
  onChange: (files: File[]) => void
  disabled?: boolean
}

export function FileDropzone({ value, onChange, disabled }: FileDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)
  const [error, setError] = useState('')

  // Build a preview URL per image ONCE per file (keyed off the file list), and
  // revoke them on change/unmount. Doing this inline in render created a new
  // object URL on every keystroke of the parent form — reloading the <img>s,
  // leaking memory, and causing layout jank. This makes previews stable.
  const [previews, setPreviews] = useState<string[]>([])
  useEffect(() => {
    const urls = value.map((f) =>
      f.type.startsWith('image/') && f.type !== 'image/heic' && f.type !== 'image/heif'
        ? URL.createObjectURL(f)
        : '',
    )
    setPreviews(urls)
    return () => urls.forEach((u) => u && URL.revokeObjectURL(u))
  }, [value])

  const addFiles = useCallback(
    (incoming: FileList | File[]) => {
      setError('')
      const next = [...value]
      for (const f of Array.from(incoming)) {
        if (next.length >= MAX_FILES) {
          setError(`You can attach up to ${MAX_FILES} photos.`)
          break
        }
        if (!ALLOWED.has(f.type)) {
          setError(`"${f.name}" isn't a supported type (JPG, PNG, WEBP, HEIC, PDF).`)
          continue
        }
        if (f.size > MAX_BYTES) {
          setError(`"${f.name}" is too large (max 10 MB).`)
          continue
        }
        // de-dupe by name+size
        if (next.some((e) => e.name === f.name && e.size === f.size)) continue
        next.push(f)
      }
      onChange(next)
    },
    [value, onChange],
  )

  const removeAt = (i: number) => {
    const next = value.slice()
    next.splice(i, 1)
    onChange(next)
    setError('')
  }

  return (
    <div>
      <div
        onClick={() => !disabled && inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault()
          if (!disabled) setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragOver(false)
          if (!disabled && e.dataTransfer.files?.length) addFiles(e.dataTransfer.files)
        }}
        className={`flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-8 text-center transition-colors cursor-pointer ${
          dragOver ? 'border-primary bg-accent' : 'border-border hover:border-primary/50 hover:bg-muted'
        } ${disabled ? 'opacity-50 pointer-events-none' : ''}`}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if ((e.key === 'Enter' || e.key === ' ') && !disabled) {
            e.preventDefault()
            inputRef.current?.click()
          }
        }}
        aria-label="Add photos"
      >
        <UploadCloud className="w-7 h-7 text-muted-foreground" />
        <p className="text-sm font-medium text-foreground">Add photos</p>
        <p className="text-xs text-muted-foreground">
          Tap to take a photo or choose files · up to {MAX_FILES}, 10 MB each
        </p>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          multiple
          capture="environment"
          className="hidden"
          disabled={disabled}
          onChange={(e) => {
            if (e.target.files?.length) addFiles(e.target.files)
            e.target.value = '' // allow re-selecting the same file
          }}
        />
      </div>

      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}

      {value.length > 0 && (
        <div className="mt-3 grid grid-cols-3 sm:grid-cols-4 gap-3">
          {value.map((f, i) => (
            <div key={`${f.name}-${i}`} className="relative group">
              <div className="aspect-square rounded-xl border border-border bg-muted overflow-hidden flex items-center justify-center">
                {previews[i] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={previews[i]}
                    alt={`Attached photo ${i + 1}`}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <FileText className="w-7 h-7 text-muted-foreground" />
                )}
              </div>
              <button
                type="button"
                onClick={() => removeAt(i)}
                disabled={disabled}
                className="absolute -top-2 -right-2 flex h-6 w-6 items-center justify-center rounded-full bg-foreground text-background shadow-soft hover:bg-destructive transition-colors"
                aria-label={`Remove ${f.name}`}
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
