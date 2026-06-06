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
    redirect('/auth/start')
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
  
  // 'open' is Stripe's not-yet-paid invoice; 'failed' is a previous attempt
  // that needs retry. 'processing' is ACH in flight.
  const pendingAmount = payments?.filter(p => ['open', 'failed', 'processing'].includes(p.status))
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
      case 'succeeded': return 'success'
      case 'failed':
      case 'uncollectible': return 'destructive'
      case 'processing': return 'accent'
      default: return 'warning' // open / void
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'succeeded': return '✅'
      case 'failed':
      case 'uncollectible': return '❌'
      case 'processing': return '🔄'
      case 'void': return '⛔'
      default: return '⏳' // open
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <Navigation role="tenant" userName={tenant.first_name} />
      
      <main className="max-w-6xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          <div className="mb-8">
            <h1 className="font-display text-3xl font-medium tracking-tight text-foreground">Payment History</h1>
            <p className="text-muted-foreground mt-2">View all your rent payment transactions</p>
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
                      className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted transition-colors"
                    >
                      <div className="flex items-center space-x-4">
                        <div className="w-12 h-12 bg-accent rounded-full flex items-center justify-center">
                          <span className="text-lg">{getStatusIcon(payment.status)}</span>
                        </div>
                        <div>
                          <div className="flex items-center space-x-2">
                            <p className="font-medium text-foreground">
                              Rent Payment
                            </p>
                            <Badge variant={getStatusBadgeVariant(payment.status)}>
                              {payment.status === 'processing'
                                ? 'In progress'
                                : payment.status.charAt(0).toUpperCase() + payment.status.slice(1)}
                            </Badge>
                          </div>
                          <p className="text-sm text-muted-foreground">
                            {payment.property?.address}
                            {payment.property?.unit_number && ` - Unit ${payment.property.unit_number}`}
                          </p>
                          <div className="flex items-center space-x-4 text-xs text-muted-foreground">
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
                        <p className="text-xs text-muted-foreground">
                          {formatDateTime(payment.created_at)}
                        </p>
                        {payment.stripe_payment_intent_id && (
                          <p className="text-xs text-muted-foreground">
                            ID: {payment.stripe_payment_intent_id.slice(-8)}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12">
                  <Receipt className="w-16 h-16 text-muted-foreground/50 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-foreground mb-2">No payment history yet</h3>
                  <p className="text-muted-foreground">
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
                <h3 className="font-medium text-foreground mb-3">Payment Status Guide</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div className="flex items-center space-x-2">
                    <span>✅</span>
                    <span className="text-muted-foreground">Succeeded - Payment completed</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <span>⏳</span>
                    <span className="text-muted-foreground">Open - Awaiting auto-charge or manual pay</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <span>🔄</span>
                    <span className="text-muted-foreground">In progress - Bank payment clearing (up to 5-7 business days)</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <span>❌</span>
                    <span className="text-muted-foreground">Failed - Payment unsuccessful</span>
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