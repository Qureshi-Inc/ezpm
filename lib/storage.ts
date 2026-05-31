/**
 * Hardened local-disk file storage for maintenance attachments.
 *
 * Security model (from the eng review — decision A1):
 *   - Files are written ONLY under UPLOADS_DIR (a mounted, persistent Docker
 *     volume). Never the container FS (wiped on redeploy), never public/.
 *   - Stored filenames are random UUIDs (<uuid>.<ext>) — the client's original
 *     filename is kept only as a DB column for display. This neutralizes path
 *     traversal (../../etc) and filename collisions.
 *   - Size + content-type are validated HERE, server-side. The client's checks
 *     are UX only; a malicious client bypasses them trivially.
 *   - Files are served back ONLY through an ownership-checked route handler
 *     (see app/api/.../maintenance/attachments/[id]). There is no public URL.
 *
 * Storage layout:  UPLOADS_DIR/maintenance/<request_id>/<uuid>.<ext>
 * DB stores file_path RELATIVE to UPLOADS_DIR (e.g. "maintenance/<rid>/<uuid>.jpg").
 */

import { randomUUID } from 'node:crypto'
import { mkdir, writeFile, readFile, rm } from 'node:fs/promises'
import path from 'node:path'

// Absolute path to the mounted uploads volume. Defaults to /app/uploads, which
// is where Coolify mounts the ezpm-uploads volume in production. Read lazily
// (per call) so it's correct at runtime and overridable in tests.
function uploadsRoot(): string {
  return process.env.UPLOADS_DIR || '/app/uploads'
}

export const MAX_FILE_BYTES = 10 * 1024 * 1024 // 10 MB
export const MAX_FILES_PER_REQUEST = 6

// Allowed content-types → canonical file extension. Anything not in this map
// is rejected server-side regardless of what the client claimed.
const ALLOWED_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'image/heif': 'heic',
  'application/pdf': 'pdf',
}

export interface StoredFile {
  /** path relative to UPLOADS_DIR — store this in maintenance_attachments.file_path */
  relativePath: string
  /** original client filename, sanitized for display only */
  displayName: string
  contentType: string
  sizeBytes: number
}

export class FileValidationError extends Error {}

/**
 * Validate + persist one uploaded file to the request's folder.
 * Throws FileValidationError on a bad type/size (caller returns 400).
 */
export async function storeAttachment(
  requestId: string,
  file: File,
): Promise<StoredFile> {
  const contentType = (file.type || '').toLowerCase()
  const ext = ALLOWED_TYPES[contentType]
  if (!ext) {
    throw new FileValidationError(
      `Unsupported file type "${file.type || 'unknown'}". Allowed: JPG, PNG, WEBP, HEIC, PDF.`,
    )
  }
  if (file.size <= 0) {
    throw new FileValidationError('Empty file.')
  }
  if (file.size > MAX_FILE_BYTES) {
    throw new FileValidationError(
      `File too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Max is 10 MB.`,
    )
  }

  // requestId comes from our own DB lookup (a UUID), but guard anyway: only
  // allow the UUID charset so it can never escape the uploads dir.
  if (!/^[0-9a-fA-F-]{36}$/.test(requestId)) {
    throw new FileValidationError('Invalid request id.')
  }

  const root = uploadsRoot()
  const storedName = `${randomUUID()}.${ext}`
  const relativePath = path.posix.join('maintenance', requestId, storedName)
  const absDir = path.join(root, 'maintenance', requestId)
  const absPath = path.join(absDir, storedName)

  // Defense in depth: the resolved absolute path MUST stay inside uploadsRoot.
  if (!absPath.startsWith(path.resolve(root) + path.sep)) {
    throw new FileValidationError('Path escapes uploads directory.')
  }

  await mkdir(absDir, { recursive: true })
  const buffer = Buffer.from(await file.arrayBuffer())
  await writeFile(absPath, buffer)

  return {
    relativePath,
    displayName: sanitizeDisplayName(file.name),
    contentType,
    sizeBytes: file.size,
  }
}

/**
 * Read a stored file's bytes for the authenticated serving route. The caller
 * MUST have already verified the requester owns/admins the request. relativePath
 * is re-validated to stay inside UPLOADS_DIR before any disk read.
 */
export async function readAttachment(relativePath: string): Promise<Buffer> {
  const root = uploadsRoot()
  const absPath = path.join(root, relativePath)
  if (!absPath.startsWith(path.resolve(root) + path.sep)) {
    throw new Error('Path escapes uploads directory.')
  }
  return readFile(absPath)
}

/** Best-effort delete of a request's whole attachment folder (on request delete). */
export async function deleteRequestFiles(requestId: string): Promise<void> {
  if (!/^[0-9a-fA-F-]{36}$/.test(requestId)) return
  const dir = path.join(uploadsRoot(), 'maintenance', requestId)
  await rm(dir, { recursive: true, force: true }).catch(() => {})
}

/**
 * Pure authorization decision for serving an attachment. Extracted so it's unit
 * testable without mocking Next/Supabase: an admin may view any attachment; a
 * tenant may view ONLY attachments whose parent request they own.
 */
export function canViewAttachment(opts: {
  role: 'admin' | 'tenant'
  sessionTenantId: string | null
  requestTenantId: string | null
}): boolean {
  if (opts.role === 'admin') return true
  return !!opts.sessionTenantId && opts.sessionTenantId === opts.requestTenantId
}

/** Keep a readable original name for display; strip any path components. */
function sanitizeDisplayName(name: string): string {
  const base = name.split(/[\\/]/).pop() || 'file'
  return base.replace(/[^\w.\-() ]/g, '_').slice(0, 200)
}

export function isAllowedType(contentType: string): boolean {
  return !!ALLOWED_TYPES[(contentType || '').toLowerCase()]
}
