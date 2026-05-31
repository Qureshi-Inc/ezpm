/**
 * GET /api/metrics — Prometheus exposition endpoint (business metrics).
 *
 * Scrapeable by Prometheus → graphable in Grafana. Token-guarded so it isn't
 * public: send `Authorization: Bearer $METRICS_TOKEN` or `?token=`. Disabled
 * (404) when METRICS_TOKEN is unset.
 *
 * Today this exposes current business gauges from lib/metrics. To add RUNTIME
 * metrics (HTTP latency histograms, error rates, event-loop lag) for app
 * performance/reliability, add `prom-client`, create a global Registry with
 * default metrics + a histogram middleware, and merge its `register.metrics()`
 * output below. Keeping this endpoint as the single scrape target means the
 * Prometheus scrape config never has to change.
 *
 * Example prometheus.yml:
 *   scrape_configs:
 *     - job_name: ezpm
 *       metrics_path: /api/metrics
 *       authorization: { credentials: "<METRICS_TOKEN>" }
 *       static_configs: [{ targets: ["app.getezpm.com"] }]
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'
import { getBusinessSnapshot } from '@/lib/metrics'

// Human-readable HELP/TYPE lines per gauge (Prometheus best practice).
const HELP: Record<string, string> = {
  ezpm_tenants_total: 'Total tenant records',
  ezpm_tenants_active: 'Tenants who have logged in (linked to an auth user)',
  ezpm_subscriptions_active: 'Tenants with an active Stripe subscription',
  ezpm_properties_total: 'Total properties',
  ezpm_properties_occupied: 'Properties with a tenant assigned',
  ezpm_expected_monthly_revenue_dollars: 'Sum of rent across occupied properties',
  ezpm_rent_collected_30d_dollars: 'Rent collected in the last 30 days',
  ezpm_payments_succeeded_30d: 'Succeeded payments in the last 30 days',
  ezpm_payments_failed_30d: 'Failed/uncollectible payments in the last 30 days',
  ezpm_maintenance_open: 'Open or in-progress maintenance requests',
}

function authorized(request: NextRequest, token: string): boolean {
  const auth = request.headers.get('authorization') || ''
  const bearer = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : ''
  const qp = request.nextUrl.searchParams.get('token') || ''
  return bearer === token || qp === token
}

export async function GET(request: NextRequest) {
  const token = process.env.METRICS_TOKEN
  if (!token) return new NextResponse('metrics disabled', { status: 404 })
  if (!authorized(request, token)) return new NextResponse('unauthorized', { status: 401 })

  try {
    const snapshot = await getBusinessSnapshot(createServerSupabaseClient())
    const lines: string[] = []
    for (const [name, value] of Object.entries(snapshot)) {
      if (HELP[name]) lines.push(`# HELP ${name} ${HELP[name]}`)
      lines.push(`# TYPE ${name} gauge`)
      lines.push(`${name} ${value}`)
    }
    return new NextResponse(lines.join('\n') + '\n', {
      status: 200,
      headers: { 'Content-Type': 'text/plain; version=0.0.4; charset=utf-8', 'Cache-Control': 'no-store' },
    })
  } catch (err) {
    console.error('[metrics] failed:', err)
    return new NextResponse('# scrape error\n', { status: 500, headers: { 'Content-Type': 'text/plain' } })
  }
}
