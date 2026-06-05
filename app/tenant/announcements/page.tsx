import { getCurrentTenant } from '@/lib/auth'
import { createServerSupabaseClient } from '@/lib/supabase'
import { redirect } from 'next/navigation'
import { Navigation } from '@/components/layout/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { formatDate } from '@/utils/helpers'
import { Megaphone } from 'lucide-react'

export default async function TenantAnnouncementsPage() {
  const tenant = await getCurrentTenant()
  if (!tenant) redirect('/auth/start')

  const supabase = createServerSupabaseClient()
  const { data: announcements } = await supabase
    .from('announcements')
    .select('id, title, body, created_at')
    .order('created_at', { ascending: false })

  const list = announcements ?? []

  return (
    <div className="min-h-screen bg-background">
      <Navigation role="tenant" userName={tenant.first_name} />

      <main className="max-w-3xl mx-auto py-8 sm:py-12 px-4 sm:px-6 lg:px-8">
        <div className="mb-8">
          <p className="text-sm font-medium text-primary mb-1">Announcements</p>
          <h1 className="font-display text-3xl sm:text-4xl font-medium tracking-tight text-foreground">
            From your property manager
          </h1>
        </div>

        {list.length === 0 ? (
          <Card>
            <CardContent className="py-14 text-center">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-accent text-accent-foreground">
                <Megaphone className="w-6 h-6" />
              </div>
              <h3 className="font-display text-xl font-medium text-foreground mb-1">Nothing new right now.</h3>
              <p className="text-muted-foreground text-sm">Notices from your property manager will show up here.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {list.map((a) => (
              <Card key={a.id}>
                <CardContent className="p-5">
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-accent text-accent-foreground">
                      <Megaphone className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-medium text-foreground">{a.title}</h3>
                      <p className="text-xs text-muted-foreground">{formatDate(a.created_at)}</p>
                      <p className="mt-2 whitespace-pre-wrap text-sm text-foreground/90">{a.body}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
