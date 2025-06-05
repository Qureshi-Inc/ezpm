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
      { data: pendingPayments }
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
        .eq('status', 'pending')
    ])

    const monthlyRevenue = monthlyPayments?.reduce((sum, p) => sum + Number(p.amount), 0) || 0
    const pendingRevenue = pendingPayments?.reduce((sum, p) => sum + Number(p.amount), 0) || 0

    return (
      <div className="min-h-screen bg-gray-50">
        <Navigation role="admin" userName="Admin" />
        
        <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
          <div className="px-4 py-6 sm:px-0">
            <h1 className="text-3xl font-bold text-gray-900 mb-8">
              Admin Dashboard
            </h1>

            {/* Statistics Cards */}
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-4 mb-8">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Tenants</CardTitle>
                  <Users className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{totalTenants || 0}</div>
                  <p className="text-xs text-muted-foreground">Active tenants</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Properties</CardTitle>
                  <Building className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{totalProperties || 0}</div>
                  <p className="text-xs text-muted-foreground">Managed properties</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Monthly Revenue</CardTitle>
                  <TrendingUp className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{formatCurrency(monthlyRevenue)}</div>
                  <p className="text-xs text-muted-foreground">This month</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Pending Payments</CardTitle>
                  <DollarSign className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{formatCurrency(pendingRevenue)}</div>
                  <p className="text-xs text-muted-foreground">To be collected</p>
                </CardContent>
              </Card>
            </div>

            {/* Quick Actions */}
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
              <Card>
                <CardHeader>
                  <CardTitle>Tenant Management</CardTitle>
                  <CardDescription>Add new tenants and manage existing ones</CardDescription>
                </CardHeader>
                <CardContent>
                  <Link href="/admin/tenants">
                    <Button className="w-full">Manage Tenants</Button>
                  </Link>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Property Management</CardTitle>
                  <CardDescription>Add and manage rental properties</CardDescription>
                </CardHeader>
                <CardContent>
                  <Link href="/admin/properties">
                    <Button className="w-full">Manage Properties</Button>
                  </Link>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Payment Overview</CardTitle>
                  <CardDescription>View all payment transactions</CardDescription>
                </CardHeader>
                <CardContent>
                  <Link href="/admin/payments">
                    <Button className="w-full">View Payments</Button>
                  </Link>
                </CardContent>
              </Card>
            </div>
          </div>
        </main>
      </div>
    )
  } catch (error) {
    redirect('/auth/login')
  }
} 