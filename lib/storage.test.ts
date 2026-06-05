/**
 * Security-critical tests for maintenance file storage (eng-review T1 floor).
 * These cover the 6 paths flagged in the plan as the ones where a silent bug
 * is a privacy/availability problem. No mocking — pure functions + real fs in
 * an OS temp dir.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdtemp, rm, readdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import {
  storeAttachment,
  readAttachment,
  canViewAttachment,
  FileValidationError,
  MAX_FILE_BYTES,
} from './storage'

const REQUEST_ID = '11111111-1111-1111-1111-111111111111'
let dir: string

beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'ezpm-uploads-'))
  process.env.UPLOADS_DIR = dir
})
afterAll(async () => {
  await rm(dir, { recursive: true, force: true })
})

function file(name: string, type: string, bytes: number): File {
  return new File([new Uint8Array(bytes)], name, { type })
}

describe('storeAttachment — server-side validation (security)', () => {
  it('rejects a disallowed content-type', async () => {
    await expect(
      storeAttachment(REQUEST_ID, file('evil.txt', 'text/plain', 10)),
    ).rejects.toBeInstanceOf(FileValidationError)
  })

  it('rejects a file over the size cap', async () => {
    await expect(
      storeAttachment(REQUEST_ID, file('big.jpg', 'image/jpeg', MAX_FILE_BYTES + 1)),
    ).rejects.toBeInstanceOf(FileValidationError)
  })

  it('stores a valid image under a UUID name and strips the client path', async () => {
    const stored = await storeAttachment(
      REQUEST_ID,
      file('../../etc/passwd.png', 'image/png', 100),
    )
    // relative path stays inside maintenance/<request_id>/
    expect(stored.relativePath.startsWith(`maintenance/${REQUEST_ID}/`)).toBe(true)
    // stored filename is a uuid.ext — NOT the client's traversal-laden name
    expect(stored.relativePath).toMatch(/maintenance\/[0-9a-f-]+\/[0-9a-f-]+\.png$/)
    expect(stored.relativePath).not.toContain('..')
    // display name has no path components
    expect(stored.displayName).not.toContain('/')
    // and it actually wrote one file into the request folder
    const files = await readdir(path.join(dir, 'maintenance', REQUEST_ID))
    expect(files.length).toBeGreaterThanOrEqual(1)
  })
})

describe('readAttachment — path traversal guard (security)', () => {
  it('refuses a relativePath that escapes the uploads root', async () => {
    await expect(readAttachment('../../../../etc/passwd')).rejects.toThrow()
  })
})

describe('canViewAttachment — ownership (security)', () => {
  it('lets an admin view any attachment', () => {
    expect(
      canViewAttachment({ role: 'admin', sessionTenantId: null, requestTenantId: 'tenant-A' }),
    ).toBe(true)
  })

  it('lets a tenant view their OWN request attachment', () => {
    expect(
      canViewAttachment({ role: 'tenant', sessionTenantId: 'tenant-A', requestTenantId: 'tenant-A' }),
    ).toBe(true)
  })

  it("blocks tenant A from viewing tenant B's attachment", () => {
    expect(
      canViewAttachment({ role: 'tenant', sessionTenantId: 'tenant-A', requestTenantId: 'tenant-B' }),
    ).toBe(false)
  })
})
