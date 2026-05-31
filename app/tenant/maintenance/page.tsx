import { getCurrentTenant } from '@/lib/auth'
import { createServerSupabaseClient } from '@/lib/supabase'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Navigation } from '@/components/layout/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { formatDate } from '@/utils/helpers'
import { CategoryIcon, categoryLabel, STATUS_LABEL, statusBadgeVariant } from '@/components/maintenance/meta'
import { Plus, ImageIcon } from 'lucide-react'

export default async function TenantMaintenancePage() {
  const tenant = await getCurrentTenant()
  if (!tenant) redirect('/auth/start')

  const supabase = createServerSupabaseClient()
  const { data: requests } = await supabase
    .from('maintenance_requests')
    .select('*, maintenance_attachments(count)')
    .eq('tenant_id', tenant.id)
    .order('created_at', { ascending: false })

  const list = requests ?? []

  return (
    <div className="min-h-screen bg-background">
      <Navigation role="tenant" userName={tenant.first_name} />

      <main className="max-w-4xl mx-auto py-8 sm:py-12 px-4 sm:px-6 lg:px-8">
        <div className="flex items-end justify-between mb-8 gap-4">
          <div>
            <p className="text-sm font-medium text-primary mb-1">Maintenance</p>
            <h1 className="font-display text-3xl sm:text-4xl font-medium tracking-tight text-foreground">
              Your requests
            </h1>
          </div>
          <Link href="/tenant/maintenance/new">
            <Button>
              <Plus className="w-4 h-4" />
              Report an issue
            </Button>
          </Link>
        </div>

        {list.length === 0 ? (
          <Card>
            <CardContent className="py-14 text-center">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-accent text-accent-foreground">
                <CategoryIcon category="other" className="w-6 h-6" />
              </div>
              <h3 className="font-display text-xl font-medium text-foreground mb-1">Nothing broken — nice.</h3>
              <p className="text-muted-foreground text-sm mb-6">
                If something needs fixing, report it here with a few photos and we&rsquo;ll take it from there.
              </p>
              <Link href="/tenant/maintenance/new">
                <Button>
                  <Plus className="w-4 h-4" />
                  Report an issue
                </Button>
              </Link>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {list.map((r) => {
              const photoCount = r.maintenance_attachments?.[0]?.count ?? 0
              return (
                <Link key={r.id} href={`/tenant/maintenance/${r.id}`} className="block">
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
                        <p className="text-sm text-muted-foreground">
                          {categoryLabel(r.category)} · {formatDate(r.created_at)}
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
}
