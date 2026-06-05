import { getSession } from '@/lib/auth'
import { createServerSupabaseClient } from '@/lib/supabase'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { Navigation } from '@/components/layout/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { formatDate } from '@/utils/helpers'
import { CategoryIcon, categoryLabel, STATUS_LABEL, statusBadgeVariant } from '@/components/maintenance/meta'
import { StatusControl } from '@/components/maintenance/StatusControl'
import { MaintenanceThread } from '@/components/maintenance/MaintenanceThread'
import { ArrowLeft } from 'lucide-react'

export default async function AdminMaintenanceDetail({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const session = await getSession()
  if (!session || session.role !== 'admin') redirect('/auth/start')
  const { id } = await params

  const supabase = createServerSupabaseClient()
  const { data: req } = await supabase
    .from('maintenance_requests')
    .select('*, maintenance_attachments(id, file_name, content_type, comment_id), tenant:tenants(first_name, last_name, email), property:properties(address, unit_number)')
    .eq('id', id)
    .maybeSingle()

  if (!req) notFound()

  const tenant = req.tenant as { first_name: string | null; last_name: string | null; email: string } | null
  const property = req.property as { address: string | null; unit_number: string | null } | null
  const attachments = (
    (req.maintenance_attachments ?? []) as { id: string; file_name: string; content_type: string; comment_id: string | null }[]
  ).filter((a) => !a.comment_id)
  const tenantName = tenant ? [tenant.first_name, tenant.last_name].filter(Boolean).join(' ') || tenant.email : 'Unknown'

  return (
    <div className="min-h-screen bg-background">
      <Navigation role="admin" userName="Admin" />

      <main className="max-w-3xl mx-auto py-8 sm:py-12 px-4 sm:px-6 lg:px-8">
        <Link
          href="/admin/maintenance"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-6"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to requests
        </Link>

        <Card>
          <CardHeader>
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3 min-w-0">
                <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-accent text-accent-foreground">
                  <CategoryIcon category={req.category} className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <CardTitle className="text-xl truncate">{req.title}</CardTitle>
                  <p className="text-sm text-muted-foreground">
                    {categoryLabel(req.category)} · {formatDate(req.created_at)}
                  </p>
                </div>
              </div>
              <Badge variant={statusBadgeVariant(req.status)}>
                {STATUS_LABEL[req.status as keyof typeof STATUS_LABEL]}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">Tenant</p>
                <p className="text-foreground">{tenantName}</p>
                {tenant?.email && <p className="text-muted-foreground">{tenant.email}</p>}
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">Property</p>
                <p className="text-foreground">{property?.address ?? '—'}</p>
                {property?.unit_number && <p className="text-muted-foreground">Unit {property.unit_number}</p>}
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">Priority</p>
                <p className="text-foreground capitalize">{req.priority}</p>
              </div>
              {req.resolved_at && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">Resolved</p>
                  <p className="text-foreground">{formatDate(req.resolved_at)}</p>
                </div>
              )}
            </div>

            {req.description && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">Details</p>
                <p className="text-sm text-foreground whitespace-pre-wrap">{req.description}</p>
              </div>
            )}

            {attachments.length > 0 && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                  Photos ({attachments.length})
                </p>
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                  {attachments.map((a, i) => (
                    <a
                      key={a.id}
                      href={`/api/tenant/maintenance/attachments/${a.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block aspect-square rounded-xl border border-border overflow-hidden bg-muted"
                    >
                      {a.content_type.startsWith('image/') ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={`/api/tenant/maintenance/attachments/${a.id}`}
                          alt={`Photo ${i + 1}`}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <span className="flex h-full items-center justify-center text-xs text-muted-foreground p-2 text-center">
                          {a.file_name}
                        </span>
                      )}
                    </a>
                  ))}
                </div>
              </div>
            )}

            <div className="pt-4 border-t border-border/70">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Update status</p>
              <StatusControl requestId={req.id} currentStatus={req.status} />
            </div>
          </CardContent>
        </Card>

        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="text-lg">Updates</CardTitle>
          </CardHeader>
          <CardContent>
            <MaintenanceThread requestId={req.id} viewerRole="admin" />
          </CardContent>
        </Card>
      </main>
    </div>
  )
}
