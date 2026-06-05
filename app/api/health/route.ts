/**
 * Public liveness probe for uptime monitoring (Uptime Kuma).
 * Intentionally cheap and dependency-free: a 200 here means the Next.js app
 * process is serving requests. Database / auth / bridge are monitored as their
 * own targets so an outage points at the right component.
 */
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export function GET() {
  return NextResponse.json(
    { ok: true, service: 'ezpm-app', time: new Date().toISOString() },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
