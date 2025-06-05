import { getCurrentTenant } from '@/lib/auth'
import { createServerSupabaseClient } from '@/lib/supabase'
import { redirect } from 'next/navigation'
import { Navigation } from '@/components/layout/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { formatCurrency, formatDate, formatDateTime } from '@/utils/helpers'
import { Receipt, DollarSign, Calendar, Clock } from 'lucide-react'

export default async function PaymentHistoryPage() {
  const tenant = await getCurrentTenant()
  
  if (!tenant) {
    redirect('/auth/login')
  }

  const supabase = createServerSupabaseClient()

  // Get payment history for this tenant
  const { data: payments, error } = await supabase
    .from('payments')
    .select(`
      *,
      property:properties(address, unit_number),
      payment_method:payment_methods(type, last4)
    `)
    .eq('tenant_id', tenant.id)
    .order('created_at', { ascending: false })

  // Calculate payment statistics
  const totalPaid = payments?.filter(p => p.status === 'succeeded')
    .reduce((sum, p) => sum + Number(p.amount), 0) || 0
  
  const pendingAmount = payments?.filter(p => p.status === 'pending')
    .reduce((sum, p) => sum + Number(p.amount), 0) || 0

  const thisYear = new Date().getFullYear()
  const yearlyPaid = payments?.filter(p => 
    p.status === 'succeeded' && 
    new Date(p.paid_at || p.created_at).getFullYear() === thisYear
  ).reduce((sum, p) => sum + Number(p.amount), 0) || 0

  if (error) {
    console.error('Error fetching payment history:', error)
  }

  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case 'succeeded': return 'default'
      case 'failed': return 'destructive'
      case 'processing': return 'secondary'
      default: return 'secondary'
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'succeeded': return '✅'
      case 'failed': return '❌'
      case 'processing': return '🔄'
      default: return '⏳'
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation role="tenant" userName={tenant.first_name} />
      
      <main className="max-w-6xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900">Payment History</h1>
            <p className="text-gray-600 mt-2">View all your rent payment transactions</p>
          </div>

          {/* Payment Statistics */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3 mb-8">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Paid</CardTitle>
                <DollarSign className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatCurrency(totalPaid)}</div>
                <p className="text-xs text-muted-foreground">All time</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">This Year</CardTitle>
                <Calendar className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatCurrency(yearlyPaid)}</div>
                <p className="text-xs text-muted-foreground">{thisYear}</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Pending</CardTitle>
                <Clock className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatCurrency(pendingAmount)}</div>
                <p className="text-xs text-muted-foreground">Outstanding</p>
              </CardContent>
            </Card>
          </div>

          {/* Payment History */}
          <Card>
            <CardHeader>
              <CardTitle>Transaction History</CardTitle>
              <CardDescription>
                Complete record of all your rent payments
              </CardDescription>
            </CardHeader>
            <CardContent>
              {payments && payments.length > 0 ? (
                <div className="space-y-4">
                  {payments.map((payment) => (
                    <div 
                      key={payment.id} 
                      className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50 transition-colors"
                    >
                      <div className="flex items-center space-x-4">
                        <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
                          <span className="text-lg">{getStatusIcon(payment.status)}</span>
                        </div>
                        <div>
                          <div className="flex items-center space-x-2">
                            <p className="font-medium text-gray-900">
                              Rent Payment
                            </p>
                            <Badge variant={getStatusBadgeVariant(payment.status)}>
                              {payment.status.charAt(0).toUpperCase() + payment.status.slice(1)}
                            </Badge>
                          </div>
                          <p className="text-sm text-gray-500">
                            {payment.property?.address}
                            {payment.property?.unit_number && ` - Unit ${payment.property.unit_number}`}
                          </p>
                          <div className="flex items-center space-x-4 text-xs text-gray-400">
                            <span>Due: {formatDate(payment.due_date)}</span>
                            {payment.paid_at && (
                              <span>Paid: {formatDate(payment.paid_at)}</span>
                            )}
                            {payment.payment_method && (
                              <span>
                                {payment.payment_method.type === 'card' ? 'Card' : 'Bank'} ****{payment.payment_method.last4}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      
                      <div className="text-right">
                        <p className="text-lg font-bold">{formatCurrency(payment.amount)}</p>
                        <p className="text-xs text-gray-400">
                          {formatDateTime(payment.created_at)}
                        </p>
                        {payment.stripe_payment_intent_id && (
                          <p className="text-xs text-gray-400">
                            ID: {payment.stripe_payment_intent_id.slice(-8)}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12">
                  <Receipt className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">No payment history yet</h3>
                  <p className="text-gray-600">
                    Your payment transactions will appear here once you start making payments.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Payment Status Legend */}
          {payments && payments.length > 0 && (
            <Card className="mt-6">
              <CardContent className="pt-6">
                <h3 className="font-medium text-gray-900 mb-3">Payment Status Guide</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div className="flex items-center space-x-2">
                    <span>✅</span>
                    <span className="text-gray-600">Succeeded - Payment completed</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <span>⏳</span>
                    <span className="text-gray-600">Pending - Awaiting payment</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <span>🔄</span>
                    <span className="text-gray-600">Processing - Payment in progress</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <span>❌</span>
                    <span className="text-gray-600">Failed - Payment unsuccessful</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </main>
    </div>
  )
} 