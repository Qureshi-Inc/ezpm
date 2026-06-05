import { requireAdmin } from '@/lib/auth'
import { createServerSupabaseClient } from '@/lib/supabase'
import { redirect } from 'next/navigation'
import { Navigation } from '@/components/layout/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { AnalyticsDashboard } from '@/components/admin/AnalyticsDashboard'
import Link from 'next/link'

export default async function AdminDashboard() {
  try {
    await requireAdmin()
    const supabase = createServerSupabaseClient()

    const { count: openMaintenance } = await supabase
      .from('maintenance_requests')
      .select('*', { count: 'exact', head: true })
      .in('status', ['open', 'in_progress'])

    return (
      <div className="min-h-screen bg-background">
        <Navigation role="admin" userName="Admin" />

        <main className="max-w-6xl mx-auto py-8 sm:py-12 px-4 sm:px-6 lg:px-8">
          <div className="mb-8">
            <p className="text-sm font-medium text-primary mb-1">Overview</p>
            <h1 className="font-display text-3xl sm:text-4xl font-medium tracking-tight text-foreground">
              Dashboard
            </h1>
          </div>

          {/* KPIs + charts with timeframe selector */}
          <AnalyticsDashboard />

          {/* Quick Actions */}
          <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {[
              { title: 'Tenants', desc: 'Add and manage tenants', href: '/admin/tenants', cta: 'Manage tenants' },
              { title: 'Properties', desc: 'Add and manage properties', href: '/admin/properties', cta: 'Manage properties' },
              { title: 'Payments', desc: 'View all transactions', href: '/admin/payments', cta: 'View payments' },
              {
                title: 'Maintenance',
                desc: (openMaintenance || 0) > 0 ? `${openMaintenance} open request${openMaintenance === 1 ? '' : 's'}` : 'No open requests',
                href: '/admin/maintenance',
                cta: 'View requests',
              },
              { title: 'Announcements', desc: 'Post a notice to all tenants', href: '/admin/announcements', cta: 'Manage announcements' },
            ].map(({ title, desc, href, cta }) => (
              <Card key={href} className="lift">
                <CardHeader>
                  <CardTitle className="text-lg">{title}</CardTitle>
                  <CardDescription>{desc}</CardDescription>
                </CardHeader>
                <CardContent>
                  <Link href={href}>
                    <Button variant="outline" className="w-full">{cta}</Button>
                  </Link>
                </CardContent>
              </Card>
            ))}
          </div>
        </main>
      </div>
    )
  } catch {
    redirect('/auth/start')
  }
}
