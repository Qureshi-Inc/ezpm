/**
 * Constant-time string comparison for shared secrets / tokens.
 *
 * `a === b` short-circuits on the first differing byte, which leaks timing an
 * attacker can use to recover a secret byte-by-byte. timingSafeEqual compares
 * in constant time, but throws on length mismatch — so we length-check first
 * (the length is not itself secret here) and only then compare.
 */

import { timingSafeEqual } from 'node:crypto'

export function safeEqual(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false
  const ab = Buffer.from(a)
  const bb = Buffer.from(b)
  if (ab.length !== bb.length) return false
  return timingSafeEqual(ab, bb)
}
