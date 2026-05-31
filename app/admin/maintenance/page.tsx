import { requireAdmin } from '@/lib/auth'
import { createServerSupabaseClient } from '@/lib/supabase'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Navigation } from '@/components/layout/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { formatDate } from '@/utils/helpers'
import { CategoryIcon, categoryLabel, STATUS_LABEL, statusBadgeVariant } from '@/components/maintenance/meta'
import { ImageIcon } from 'lucide-react'

const STATUS_RANK: Record<string, number> = { open: 0, in_progress: 1, resolved: 2, cancelled: 3 }

const FILTERS: { value: string; label: string; match: (s: string) => boolean }[] = [
  { value: 'all', label: 'All', match: () => true },
  { value: 'active', label: 'Active', match: (s) => s === 'open' || s === 'in_progress' },
  { value: 'open', label: 'Open', match: (s) => s === 'open' },
  { value: 'in_progress', label: 'In progress', match: (s) => s === 'in_progress' },
  { value: 'resolved', label: 'Resolved', match: (s) => s === 'resolved' },
  { value: 'cancelled', label: 'Cancelled', match: (s) => s === 'cancelled' },
]

export default async function AdminMaintenancePage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>
}) {
  try {
    await requireAdmin()
    const { status } = await searchParams
    const active = FILTERS.find((f) => f.value === status) ?? FILTERS[0]
    const supabase = createServerSupabaseClient()
    const { data } = await supabase
      .from('maintenance_requests')
      .select('*, maintenance_attachments(count), tenant:tenants(first_name, last_name, email), property:properties(address, unit_number)')
      .order('created_at', { ascending: false })

    // Sort: active first (open, in_progress), urgent above normal, then newest.
    const all = (data ?? []).slice().sort((a, b) => {
      const sr = (STATUS_RANK[a.status] ?? 9) - (STATUS_RANK[b.status] ?? 9)
      if (sr !== 0) return sr
      const pr = (a.priority === 'urgent' ? 0 : 1) - (b.priority === 'urgent' ? 0 : 1)
      if (pr !== 0) return pr
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    })

    const list = all.filter((r) => active.match(r.status))
    const openCount = all.filter((r) => r.status === 'open' || r.status === 'in_progress').length

    return (
      <div className="min-h-screen bg-background">
        <Navigation role="admin" userName="Admin" />

        <main className="max-w-5xl mx-auto py-8 sm:py-12 px-4 sm:px-6 lg:px-8">
          <div className="mb-6">
            <p className="text-sm font-medium text-primary mb-1">Maintenance</p>
            <h1 className="font-display text-3xl sm:text-4xl font-medium tracking-tight text-foreground">
              Requests
            </h1>
            <p className="text-muted-foreground mt-2">{openCount} open or in progress</p>
          </div>

          {/* Status filter */}
          <div className="mb-6 flex flex-wrap gap-2">
            {FILTERS.map((f) => {
              const count = all.filter((r) => f.match(r.status)).length
              const isActive = f.value === active.value
              const href = f.value === 'all' ? '/admin/maintenance' : `/admin/maintenance?status=${f.value}`
              return (
                <Link
                  key={f.value}
                  href={href}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
                    isActive
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border bg-card text-muted-foreground hover:text-foreground hover:border-primary/40'
                  }`}
                >
                  {f.label}
                  <span className={`tabular-nums ${isActive ? 'text-primary-foreground/80' : 'text-muted-foreground/70'}`}>
                    {count}
                  </span>
                </Link>
              )
            })}
          </div>

          {list.length === 0 ? (
            <Card>
              <CardContent className="py-14 text-center">
                <h3 className="font-display text-xl font-medium text-foreground mb-1">
                  {active.value === 'all' ? 'No requests yet' : `No ${active.label.toLowerCase()} requests`}
                </h3>
                <p className="text-muted-foreground text-sm">
                  {active.value === 'all'
                    ? 'Tenant maintenance requests will show up here.'
                    : 'Try a different filter above.'}
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {list.map((r) => {
                const tenant = r.tenant as { first_name: string | null; last_name: string | null; email: string } | null
                const property = r.property as { address: string | null; unit_number: string | null } | null
                const photoCount = r.maintenance_attachments?.[0]?.count ?? 0
                const tenantName = tenant
                  ? [tenant.first_name, tenant.last_name].filter(Boolean).join(' ') || tenant.email
                  : 'Unknown tenant'
                return (
                  <Link key={r.id} href={`/admin/maintenance/${r.id}`} className="block">
                    <Card className="lift">
                      <CardContent className="p-5 flex items-center gap-4">
                        <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-accent text-accent-foreground">
                          <CategoryIcon category={r.category} className="w-5 h-5" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <p className="font-medium text-foreground truncate">{r.title}</p>
                            {r.priority === 'urgent' && r.status !== 'resolved' && r.status !== 'cancelled' && (
                              <Badge variant="destructive">Urgent</Badge>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground truncate">
                            {tenantName}
                            {property?.address ? ` · ${property.address}` : ''} · {categoryLabel(r.category)} · {formatDate(r.created_at)}
                            {photoCount > 0 && (
                              <span className="inline-flex items-center gap-1 ml-2">
                                <ImageIcon className="w-3.5 h-3.5" />
                                {photoCount}
                              </span>
                            )}
                          </p>
                        </div>
                        <Badge variant={statusBadgeVariant(r.status)}>{STATUS_LABEL[r.status as keyof typeof STATUS_LABEL]}</Badge>
                      </CardContent>
                    </Card>
                  </Link>
                )
              })}
            </div>
          )}
        </main>
      </div>
    )
  } catch {
    redirect('/auth/start')
  }
}
