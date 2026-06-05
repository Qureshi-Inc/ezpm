import { getCurrentTenant } from '@/lib/auth'
import { createServerSupabaseClient } from '@/lib/supabase'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { Navigation } from '@/components/layout/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { formatDate } from '@/utils/helpers'
import { CategoryIcon, categoryLabel, STATUS_LABEL, statusBadgeVariant } from '@/components/maintenance/meta'
import { CancelRequestButton } from '@/components/maintenance/CancelRequestButton'
import { MaintenanceThread } from '@/components/maintenance/MaintenanceThread'
import { ArrowLeft } from 'lucide-react'

export default async function TenantMaintenanceDetail({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const tenant = await getCurrentTenant()
  if (!tenant) redirect('/auth/start')
  const { id } = await params

  const supabase = createServerSupabaseClient()
  const { data: req } = await supabase
    .from('maintenance_requests')
    .select('*, maintenance_attachments(id, file_name, content_type, comment_id)')
    .eq('id', id)
    .maybeSingle()

  // Ownership: a tenant can only view their own request.
  if (!req || req.tenant_id !== tenant.id) notFound()

  // Only the original request photos here (comment photos live in the thread).
  const attachments = (
    (req.maintenance_attachments ?? []) as {
      id: string
      file_name: string
      content_type: string
      comment_id: string | null
    }[]
  ).filter((a) => !a.comment_id)

  return (
    <div className="min-h-screen bg-background">
      <Navigation role="tenant" userName={tenant.first_name} />

      <main className="max-w-2xl mx-auto py-8 sm:py-12 px-4 sm:px-6 lg:px-8">
        <Link
          href="/tenant/maintenance"
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
                    {categoryLabel(req.category)} · reported {formatDate(req.created_at)}
                  </p>
                </div>
              </div>
              <Badge variant={statusBadgeVariant(req.status)}>
                {STATUS_LABEL[req.status as keyof typeof STATUS_LABEL]}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {req.priority === 'urgent' && (
              <Badge variant="destructive">Marked urgent</Badge>
            )}

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
                          alt={`Photo ${i + 1} of reported issue`}
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

            {req.resolved_at && (
              <p className="text-sm text-success">Resolved {formatDate(req.resolved_at)}.</p>
            )}

            {req.status === 'open' && (
              <div className="pt-2 border-t border-border/70">
                <CancelRequestButton requestId={req.id} />
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="text-lg">Updates</CardTitle>
          </CardHeader>
          <CardContent>
            <MaintenanceThread requestId={req.id} viewerRole="tenant" />
          </CardContent>
        </Card>
      </main>
    </div>
  )
}
