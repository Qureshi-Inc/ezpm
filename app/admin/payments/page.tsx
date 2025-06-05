import { requireAdmin } from '@/lib/auth'
import { createServerSupabaseClient } from '@/lib/supabase'
import { redirect } from 'next/navigation'
import { Navigation } from '@/components/layout/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { formatCurrency, formatDate, getPaymentStatusColor } from '@/utils/helpers'
import { GeneratePaymentsButton } from '@/components/admin/GeneratePaymentsButton'
import { DollarSign, TrendingUp, Clock, CheckCircle } from 'lucide-react'

export default async function PaymentsPage() {
  try {
    const session = await requireAdmin()
    const supabase = createServerSupabaseClient()

    // Get all payments with tenant and property info
    const { data: payments, error } = await supabase
      .from('payments')
      .select(`
        *,
        tenant:tenants(first_name, last_name),
        property:properties(address, unit_number)
      `)
      .order('created_at', { ascending: false })
      .limit(50)

    // Get payment statistics
    const [
      { data: totalRevenue },
      { data: monthlyRevenue },
      { data: pendingPayments },
      { data: successfulPayments }
    ] = await Promise.all([
      supabase
        .from('payments')
        .select('amount')
        .eq('status', 'succeeded'),
      supabase
        .from('payments')
        .select('amount')
        .eq('status', 'succeeded')
        .gte('paid_at', new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()),
      supabase
        .from('payments')
        .select('amount')
        .eq('status', 'pending'),
      supabase
        .from('payments')
        .select('amount')
        .eq('status', 'succeeded')
        .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
    ])

    const totalAmount = totalRevenue?.reduce((sum, p) => sum + Number(p.amount), 0) || 0
    const monthlyAmount = monthlyRevenue?.reduce((sum, p) => sum + Number(p.amount), 0) || 0
    const pendingAmount = pendingPayments?.reduce((sum, p) => sum + Number(p.amount), 0) || 0
    const recentAmount = successfulPayments?.reduce((sum, p) => sum + Number(p.amount), 0) || 0

    if (error) {
      console.error('Error fetching payments:', error)
    }

    return (
      <div className="min-h-screen bg-gray-50">
        <Navigation role="admin" userName="Admin" />
        
        <main className="max-w-7xl mx-auto py-3 sm:py-6 px-4 sm:px-6 lg:px-8">
          <div className="py-3 sm:py-6">
            <div className="mb-8">
              <div>
                <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Payment Overview</h1>
                <p className="text-gray-600 mt-2">Track all payment transactions and revenue</p>
              </div>
            </div>

            {/* Statistics Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 mb-6 sm:mb-8">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
                  <DollarSign className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{formatCurrency(totalAmount)}</div>
                  <p className="text-xs text-muted-foreground">All time</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">This Month</CardTitle>
                  <TrendingUp className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{formatCurrency(monthlyAmount)}</div>
                  <p className="text-xs text-muted-foreground">Current month</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Pending</CardTitle>
                  <Clock className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{formatCurrency(pendingAmount)}</div>
                  <p className="text-xs text-muted-foreground">Awaiting payment</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Last 30 Days</CardTitle>
                  <CheckCircle className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{formatCurrency(recentAmount)}</div>
                  <p className="text-xs text-muted-foreground">Recent collections</p>
                </CardContent>
              </Card>
            </div>

            {/* Payments Table */}
            <Card>
              <CardHeader>
                <CardTitle>Recent Payments</CardTitle>
                <CardDescription>
                  Latest payment transactions from all tenants
                </CardDescription>
              </CardHeader>
              <CardContent>
                {payments && payments.length > 0 ? (
                  <div className="space-y-4">
                    {payments.map((payment) => (
                      <div 
                        key={payment.id} 
                        className="flex flex-col sm:flex-row sm:items-center sm:justify-between p-4 border rounded-lg hover:bg-gray-50 transition-colors space-y-3 sm:space-y-0"
                      >
                        <div className="flex items-center space-x-4">
                          <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
                            <DollarSign className="w-5 h-5 text-blue-600" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="font-medium text-gray-900 truncate">
                              {payment.tenant?.first_name} {payment.tenant?.last_name}
                            </p>
                            <p className="text-sm text-gray-500 truncate">
                              {payment.property?.address}
                              {payment.property?.unit_number && ` - Unit ${payment.property.unit_number}`}
                            </p>
                            <p className="text-xs text-gray-400">
                              Due: {formatDate(payment.due_date)}
                            </p>
                          </div>
                        </div>
                        
                        <div className="flex items-center justify-between sm:flex-col sm:items-end sm:text-right">
                          <p className="font-bold text-lg">{formatCurrency(payment.amount)}</p>
                          <div className="flex flex-col items-end">
                            <Badge 
                              variant={payment.status === 'succeeded' ? 'default' : 
                                      payment.status === 'failed' ? 'destructive' : 'secondary'}
                              className="mt-1"
                            >
                              {payment.status.charAt(0).toUpperCase() + payment.status.slice(1)}
                            </Badge>
                            <p className="text-xs text-gray-400 mt-1">
                              {formatDate(payment.created_at)}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <DollarSign className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-gray-900 mb-2">No payments yet</h3>
                    <p className="text-gray-600">
                      Payment transactions will appear here once tenants start making payments.
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Admin Controls - Bottom of Page */}
            <div className="mt-8">
              <GeneratePaymentsButton />
            </div>
          </div>
        </main>
      </div>
    )
  } catch (error) {
    redirect('/auth/login')
  }
} 