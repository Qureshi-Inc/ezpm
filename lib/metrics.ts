/**
 * Admin metrics aggregation — the single source for both the dashboard charts
 * and the Prometheus endpoint (/api/metrics).
 *
 * Aggregation runs in JS over rows fetched in the selected window. That's fine
 * at small-portfolio scale (hundreds of payments). If this ever needs to scale,
 * swap the per-series reducers for SQL RPCs that GROUP BY date_trunc — the
 * function signatures here stay the same, so callers don't change.
 *
 * The same building blocks feed two shapes:
 *   - getDashboardMetrics(range) → KPI snapshot + time series for charts
 *   - getBusinessSnapshot()      → flat gauges for Prometheus scraping
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
type Supabase = any

export type MetricsRange = '1m' | '3m' | '6m' | '1y' | '2y' | 'max'

export const RANGES: { value: MetricsRange; label: string }[] = [
  { value: '1m', label: '1M' },
  { value: '3m', label: '3M' },
  { value: '6m', label: '6M' },
  { value: '1y', label: '1Y' },
  { value: '2y', label: '2Y' },
  { value: 'max', label: 'Max' },
]

export interface DashboardMetrics {
  range: MetricsRange
  bucket: 'day' | 'month'
  generatedAt: string
  summary: {
    collected: number
    paymentsSucceeded: number
    paymentsFailed: number
    expectedMonthly: number
    activeTenants: number
    totalTenants: number
    occupiedProperties: number
    totalProperties: number
    openMaintenance: number
  }
  series: Array<{
    period: string
    label: string
    collected: number
    succeeded: number
    failed: number
    newTenants: number
    tenantsCumulative: number
    maintenanceCreated: number
    maintenanceResolved: number
  }>
}

function monthsAgo(n: number): Date {
  const d = new Date()
  d.setMonth(d.getMonth() - n)
  return d
}

function rangeStart(range: MetricsRange): Date | null {
  switch (range) {
    case '1m': return monthsAgo(1)
    case '3m': return monthsAgo(3)
    case '6m': return monthsAgo(6)
    case '1y': return monthsAgo(12)
    case '2y': return monthsAgo(24)
    case 'max': return null
  }
}

function bucketFor(range: MetricsRange): 'day' | 'month' {
  return range === '1m' || range === '3m' ? 'day' : 'month'
}

const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
const dayKey = (d: Date) => d.toISOString().slice(0, 10)

function keyOf(dateIso: string | null, gran: 'day' | 'month'): string | null {
  if (!dateIso) return null
  const d = new Date(dateIso)
  if (isNaN(d.getTime())) return null
  return gran === 'month' ? monthKey(d) : dayKey(d)
}

function bucketKeys(start: Date, end: Date, gran: 'day' | 'month'): string[] {
  const keys: string[] = []
  if (gran === 'month') {
    let d = new Date(start.getFullYear(), start.getMonth(), 1)
    const last = new Date(end.getFullYear(), end.getMonth(), 1)
    while (d <= last) {
      keys.push(monthKey(d))
      d = new Date(d.getFullYear(), d.getMonth() + 1, 1)
    }
  } else {
    const d = new Date(start)
    d.setHours(0, 0, 0, 0)
    const last = new Date(end)
    last.setHours(0, 0, 0, 0)
    while (d <= last) {
      keys.push(dayKey(d))
      d.setDate(d.getDate() + 1)
    }
  }
  return keys
}

function labelFor(key: string, gran: 'day' | 'month'): string {
  if (gran === 'month') {
    const [y, m] = key.split('-').map(Number)
    return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
  }
  const d = new Date(key + 'T00:00:00')
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export async function getDashboardMetrics(supabase: Supabase, range: MetricsRange): Promise<DashboardMetrics> {
  const now = new Date()
  const gran = bucketFor(range)
  const start = rangeStart(range)
  const startIso = start ? start.toISOString() : null

  // Fetch windowed rows. For 'max' there is no lower bound.
  const paymentsQ = supabase.from('payments').select('amount, status, created_at, paid_at').limit(20000)
  const maintQ = supabase.from('maintenance_requests').select('created_at, status, resolved_at').limit(20000)
  if (startIso) {
    paymentsQ.gte('created_at', startIso)
    maintQ.gte('created_at', startIso)
  }

  const [{ data: payments }, { data: maint }, { data: tenants }, { data: properties }] = await Promise.all([
    paymentsQ,
    maintQ,
    supabase.from('tenants').select('created_at, user_id, property_id, stripe_subscription_id').limit(20000),
    supabase.from('properties').select('id, rent_amount').limit(20000),
  ])

  const pays = payments ?? []
  const maints = maint ?? []
  const tens = tenants ?? []
  const props = properties ?? []

  // Determine effective window start (for 'max', earliest data we have).
  let effStart = start
  if (!effStart) {
    const dates = [
      ...pays.map((p: any) => p.created_at),
      ...tens.map((t: any) => t.created_at),
      ...maints.map((m: any) => m.created_at),
    ].filter(Boolean).map((s: string) => new Date(s).getTime())
    effStart = dates.length ? new Date(Math.min(...dates)) : monthsAgo(12)
  }

  const keys = bucketKeys(effStart, now, gran)
  const idx = new Map(keys.map((k, i) => [k, i]))
  const series = keys.map((k) => ({
    period: k,
    label: labelFor(k, gran),
    collected: 0,
    succeeded: 0,
    failed: 0,
    newTenants: 0,
    tenantsCumulative: 0,
    maintenanceCreated: 0,
    maintenanceResolved: 0,
  }))

  let collected = 0
  let paymentsSucceeded = 0
  let paymentsFailed = 0
  for (const p of pays) {
    const amt = Number(p.amount) || 0
    const k = keyOf(p.paid_at || p.created_at, gran)
    const row = k != null ? series[idx.get(k) ?? -1] : undefined
    if (p.status === 'succeeded') {
      collected += amt
      paymentsSucceeded += 1
      if (row) { row.collected += amt; row.succeeded += 1 }
    } else if (p.status === 'failed' || p.status === 'uncollectible') {
      paymentsFailed += 1
      if (row) row.failed += 1
    }
  }

  for (const m of maints) {
    const ck = keyOf(m.created_at, gran)
    const cr = ck != null ? series[idx.get(ck) ?? -1] : undefined
    if (cr) cr.maintenanceCreated += 1
    if (m.resolved_at) {
      const rk = keyOf(m.resolved_at, gran)
      const rr = rk != null ? series[idx.get(rk) ?? -1] : undefined
      if (rr) rr.maintenanceResolved += 1
    }
  }

  // Tenant growth: new per bucket + cumulative across the whole window.
  let priorTenants = 0
  for (const t of tens) {
    const k = keyOf(t.created_at, gran)
    if (k == null) continue
    const i = idx.get(k)
    if (i == null) {
      // Created before the window — counts toward the starting cumulative.
      if (new Date(t.created_at) < effStart) priorTenants += 1
    } else {
      series[i].newTenants += 1
    }
  }
  let running = priorTenants
  for (const row of series) {
    running += row.newTenants
    row.tenantsCumulative = running
  }

  const occupied = new Set(tens.map((t: any) => t.property_id).filter(Boolean))
  const expectedMonthly = props
    .filter((p: any) => occupied.has(p.id))
    .reduce((s: number, p: any) => s + (Number(p.rent_amount) || 0), 0)

  return {
    range,
    bucket: gran,
    generatedAt: now.toISOString(),
    summary: {
      collected,
      paymentsSucceeded,
      paymentsFailed,
      expectedMonthly,
      activeTenants: tens.filter((t: any) => t.user_id).length,
      totalTenants: tens.length,
      occupiedProperties: occupied.size,
      totalProperties: props.length,
      openMaintenance: maints.filter((m: any) => m.status === 'open' || m.status === 'in_progress').length,
    },
    series,
  }
}

/**
 * Flat current-state gauges for Prometheus. Kept deliberately simple and
 * label-free; add labels/histograms when wiring runtime metrics (see /api/metrics).
 */
export async function getBusinessSnapshot(supabase: Supabase): Promise<Record<string, number>> {
  const thirtyDaysAgo = monthsAgo(1).toISOString()
  const [{ data: tenants }, { data: properties }, { data: pays30 }, { count: openMaintenance }] = await Promise.all([
    supabase.from('tenants').select('user_id, property_id, stripe_subscription_id').limit(20000),
    supabase.from('properties').select('id, rent_amount').limit(20000),
    supabase.from('payments').select('amount, status').gte('created_at', thirtyDaysAgo).limit(20000),
    supabase.from('maintenance_requests').select('*', { count: 'exact', head: true }).in('status', ['open', 'in_progress']),
  ])

  const tens = tenants ?? []
  const props = properties ?? []
  const p30 = pays30 ?? []
  const occupied = new Set(tens.map((t: any) => t.property_id).filter(Boolean))

  return {
    ezpm_tenants_total: tens.length,
    ezpm_tenants_active: tens.filter((t: any) => t.user_id).length,
    ezpm_subscriptions_active: tens.filter((t: any) => t.stripe_subscription_id).length,
    ezpm_properties_total: props.length,
    ezpm_properties_occupied: occupied.size,
    ezpm_expected_monthly_revenue_dollars: props
      .filter((p: any) => occupied.has(p.id))
      .reduce((s: number, p: any) => s + (Number(p.rent_amount) || 0), 0),
    ezpm_rent_collected_30d_dollars: p30
      .filter((p: any) => p.status === 'succeeded')
      .reduce((s: number, p: any) => s + (Number(p.amount) || 0), 0),
    ezpm_payments_succeeded_30d: p30.filter((p: any) => p.status === 'succeeded').length,
    ezpm_payments_failed_30d: p30.filter((p: any) => p.status === 'failed' || p.status === 'uncollectible').length,
    ezpm_maintenance_open: openMaintenance || 0,
  }
}
