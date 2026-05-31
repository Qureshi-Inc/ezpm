'use client'

/**
 * Admin analytics dashboard — KPI cards + charts with a timeframe selector.
 * Fetches /api/admin/metrics?range=… (no full page reload on range change).
 * Charts are Recharts; data shape comes from lib/metrics.ts (DashboardMetrics).
 */

import { useCallback, useEffect, useState } from 'react'
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatCurrency } from '@/utils/helpers'
import { RANGES, type MetricsRange, type DashboardMetrics } from '@/lib/metrics'
import { TrendingUp, Users, Building, Wrench, Loader2 } from 'lucide-react'

const C = {
  teal: '#0D7377',
  leaf: '#4D8B5C',
  amber: '#B88828',
  red: '#B05446',
  grid: '#E8DFC9',
  muted: '#897F73',
}

const compactCurrency = (n: number) =>
  n >= 1000 ? `$${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : `$${Math.round(n)}`

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-medium">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-64 w-full">{children}</div>
      </CardContent>
    </Card>
  )
}

const tooltipStyle = {
  borderRadius: 12,
  border: `1px solid ${C.grid}`,
  fontSize: 12,
  background: '#fff',
}

export function AnalyticsDashboard() {
  const [range, setRange] = useState<MetricsRange>('6m')
  const [data, setData] = useState<DashboardMetrics | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async (r: MetricsRange) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/metrics?range=${r}`, { cache: 'no-store' })
      if (res.ok) setData(await res.json())
    } catch {
      /* ignore */
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load(range)
  }, [range, load])

  const s = data?.summary
  const series = data?.series ?? []

  const kpis = [
    { label: 'Collected (period)', value: s ? formatCurrency(s.collected) : '—', sub: `${s?.paymentsSucceeded ?? 0} payments`, Icon: TrendingUp },
    { label: 'Expected / month', value: s ? formatCurrency(s.expectedMonthly) : '—', sub: 'occupied units', Icon: TrendingUp },
    { label: 'Tenants', value: s ? `${s.activeTenants}/${s.totalTenants}` : '—', sub: 'active / total', Icon: Users },
    { label: 'Occupancy', value: s ? `${s.occupiedProperties}/${s.totalProperties}` : '—', sub: 'units filled', Icon: Building },
    { label: 'Failed payments', value: s ? String(s.paymentsFailed) : '—', sub: 'in period', Icon: TrendingUp },
    { label: 'Open maintenance', value: s ? String(s.openMaintenance) : '—', sub: 'open or in progress', Icon: Wrench },
  ]

  return (
    <div className="space-y-5">
      {/* Timeframe selector */}
      <div className="flex items-center gap-2">
        <div className="inline-flex rounded-xl border border-border bg-card p-1">
          {RANGES.map((r) => (
            <button
              key={r.value}
              onClick={() => setRange(r.value)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                range === r.value ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
        {loading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
        {kpis.map(({ label, value, sub, Icon }) => (
          <Card key={label}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
                <Icon className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="font-display text-2xl font-medium tracking-tight text-foreground tabular-nums">{value}</div>
              <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <ChartCard title="Rent collected">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={series} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
              <defs>
                <linearGradient id="collected" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={C.teal} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={C.teal} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={C.grid} vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: C.muted }} tickLine={false} axisLine={false} minTickGap={16} />
              <YAxis tickFormatter={compactCurrency} tick={{ fontSize: 11, fill: C.muted }} tickLine={false} axisLine={false} width={48} />
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              <Tooltip contentStyle={tooltipStyle} formatter={(value: any) => formatCurrency(Number(value))} />
              <Area type="monotone" dataKey="collected" name="Collected" stroke={C.teal} strokeWidth={2} fill="url(#collected)" />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Payments (succeeded vs failed)">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={series} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={C.grid} vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: C.muted }} tickLine={false} axisLine={false} minTickGap={16} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: C.muted }} tickLine={false} axisLine={false} width={32} />
              <Tooltip contentStyle={tooltipStyle} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="succeeded" name="Succeeded" stackId="p" fill={C.leaf} radius={[0, 0, 0, 0]} />
              <Bar dataKey="failed" name="Failed" stackId="p" fill={C.red} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Tenant growth">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={series} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={C.grid} vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: C.muted }} tickLine={false} axisLine={false} minTickGap={16} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: C.muted }} tickLine={false} axisLine={false} width={32} />
              <Tooltip contentStyle={tooltipStyle} />
              <Line type="monotone" dataKey="tenantsCumulative" name="Tenants" stroke={C.teal} strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Maintenance (created vs resolved)">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={series} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={C.grid} vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: C.muted }} tickLine={false} axisLine={false} minTickGap={16} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: C.muted }} tickLine={false} axisLine={false} width={32} />
              <Tooltip contentStyle={tooltipStyle} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="maintenanceCreated" name="Created" fill={C.amber} radius={[4, 4, 0, 0]} />
              <Bar dataKey="maintenanceResolved" name="Resolved" fill={C.leaf} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
    </div>
  )
}
