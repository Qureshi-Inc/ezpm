import { requireAdmin } from '@/lib/auth'
import { createServerSupabaseClient } from '@/lib/supabase'
import { redirect } from 'next/navigation'
import { Navigation } from '@/components/layout/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { formatCurrency } from '@/utils/helpers'
import Link from 'next/link'
import { Users, Building, DollarSign, TrendingUp } from 'lucide-react'

export default async function AdminDashboard() {
  try {
    const session = await requireAdmin()
    const supabase = createServerSupabaseClient()

    // Get statistics
    const [
      { count: totalTenants },
      { count: totalProperties },
      { data: monthlyPayments },
      { data: pendingPayments },
      { count: openMaintenance }
    ] = await Promise.all([
      supabase.from('tenants').select('*', { count: 'exact', head: true }),
      supabase.from('properties').select('*', { count: 'exact', head: true }),
      supabase
        .from('payments')
        .select('amount')
        .eq('status', 'succeeded')
        .gte('paid_at', new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()),
      supabase
        .from('payments')
        .select('amount')
        .in('status', ['open', 'failed', 'processing']),
      supabase
        .from('maintenance_requests')
        .select('*', { count: 'exact', head: true })
        .in('status', ['open', 'in_progress'])
    ])

    const monthlyRevenue = monthlyPayments?.reduce((sum, p) => sum + Number(p.amount), 0) || 0
    const pendingRevenue = pendingPayments?.reduce((sum, p) => sum + Number(p.amount), 0) || 0

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

          {/* Statistics Cards */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4 mb-5">
            {[
              { label: 'Tenants', value: totalTenants || 0, sub: 'Active', Icon: Users },
              { label: 'Properties', value: totalProperties || 0, sub: 'Managed', Icon: Building },
              { label: 'Revenue', value: formatCurrency(monthlyRevenue), sub: 'This month', Icon: TrendingUp },
              { label: 'Pending', value: formatCurrency(pendingRevenue), sub: 'To collect', Icon: DollarSign },
            ].map(({ label, value, sub, Icon }) => (
              <Card key={label}>
                <CardContent className="p-5">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                      <Icon className="h-4 w-4" />
                    </span>
                  </div>
                  <div className="font-display text-3xl font-medium tracking-tight text-foreground tabular-nums">{value}</div>
                  <p className="text-xs text-muted-foreground mt-1">{sub}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Quick Actions */}
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
            {[
              { title: 'Tenants', desc: 'Add and manage tenants', href: '/admin/tenants', cta: 'Manage tenants' },
              { title: 'Properties', desc: 'Add and manage properties', href: '/admin/properties', cta: 'Manage properties' },
              { title: 'Payments', desc: 'View all transactions', href: '/admin/payments', cta: 'View payments' },
            { title: 'Maintenance', desc: (openMaintenance || 0) > 0 ? `${openMaintenance} open request${openMaintenance === 1 ? '' : 's'}` : 'No open requests', href: '/admin/maintenance', cta: 'View requests' },
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
  } catch (error) {
    redirect('/auth/start')
  }
} 