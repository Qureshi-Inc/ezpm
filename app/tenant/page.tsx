import { getCurrentTenant } from '@/lib/auth'
import { createServerSupabaseClient } from '@/lib/supabase'
import { redirect } from 'next/navigation'
import { Navigation } from '@/components/layout/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { formatCurrency, formatDate } from '@/utils/helpers'
import Link from 'next/link'

export default async function TenantDashboard() {
  const tenant = await getCurrentTenant()
  
  if (!tenant) {
    redirect('/auth/login')
  }

  const supabase = createServerSupabaseClient()

  // Get next payment due
  const { data: nextPayment } = await supabase
    .from('payments')
    .select('*')
    .eq('tenant_id', tenant.id)
    .eq('status', 'pending')
    .order('due_date', { ascending: true })
    .limit(1)
    .single()

  // Get recent payments
  const { data: recentPayments } = await supabase
    .from('payments')
    .select('*')
    .eq('tenant_id', tenant.id)
    .order('created_at', { ascending: false })
    .limit(5)

  // Get payment methods count
  const { count: paymentMethodsCount } = await supabase
    .from('payment_methods')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', tenant.id)

  // Get auto payment status
  const { data: autoPayment } = await supabase
    .from('auto_payments')
    .select('*')
    .eq('tenant_id', tenant.id)
    .single()

  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation role="tenant" userName={tenant.first_name} />
      
      <main className="max-w-7xl mx-auto py-3 sm:py-6 px-4 sm:px-6 lg:px-8">
        <div className="py-3 sm:py-6">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-6 sm:mb-8">
            Welcome back, {tenant.first_name}!
          </h1>

          {/* Property Info */}
          {tenant.property && (
            <Card className="mb-6">
              <CardHeader>
                <CardTitle>Your Property</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-lg">{tenant.property.address}</p>
                {tenant.property.unit_number && (
                  <p className="text-gray-600">Unit {tenant.property.unit_number}</p>
                )}
                <p className="text-2xl font-bold mt-2">
                  {formatCurrency(tenant.property.rent_amount)}/month
                </p>
                <p className="text-sm text-gray-600 mt-2">
                  Payment due: {tenant.payment_due_day === 1 ? '1st' : tenant.payment_due_day === 2 ? '2nd' : tenant.payment_due_day === 3 ? '3rd' : `${tenant.payment_due_day}th`} of each month
                </p>
              </CardContent>
            </Card>
          )}

          <div className="grid grid-cols-1 gap-4 sm:gap-6 md:grid-cols-2 lg:grid-cols-3">
            {/* Next Payment Due */}
            <Card>
              <CardHeader>
                <CardTitle>Next Payment Due</CardTitle>
                <CardDescription>
                  {nextPayment ? formatDate(nextPayment.due_date) : 'No upcoming payments'}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {nextPayment ? (
                  <>
                    <p className="text-3xl font-bold">{formatCurrency(nextPayment.amount)}</p>
                    <Link href="/tenant/pay">
                      <Button className="mt-4 w-full">Pay Now</Button>
                    </Link>
                  </>
                ) : (
                  <>
                    <p className="text-gray-500 mb-4">You're all caught up!</p>
                    <Link href="/tenant/pay">
                      <Button variant="outline" className="w-full">Make a Payment</Button>
                    </Link>
                  </>
                )}
              </CardContent>
            </Card>

            {/* Payment Methods */}
            <Card>
              <CardHeader>
                <CardTitle>Payment Methods</CardTitle>
                <CardDescription>
                  {paymentMethodsCount || 0} method{paymentMethodsCount !== 1 ? 's' : ''} saved
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Link href="/tenant/payment-methods">
                  <Button variant="outline" className="w-full">
                    Manage Payment Methods
                  </Button>
                </Link>
              </CardContent>
            </Card>

            {/* Auto Pay Status */}
            <Card>
              <CardHeader>
                <CardTitle>Auto Pay</CardTitle>
                <CardDescription>
                  {autoPayment?.is_active ? 'Enabled' : 'Disabled'}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {autoPayment?.is_active ? (
                  <p className="text-sm text-gray-600">
                    Payments will be processed automatically on day {autoPayment.day_of_month} of each month
                  </p>
                ) : (
                  <Link href="/tenant/auto-pay/setup">
                    <Button variant="outline" className="w-full">
                      Set Up Auto Pay
                    </Button>
                  </Link>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Recent Payments */}
          {recentPayments && recentPayments.length > 0 && (
            <Card className="mt-6">
              <CardHeader>
                <CardTitle>Recent Payments</CardTitle>
                <CardDescription>Your last 5 payments</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {recentPayments.map((payment) => (
                    <div key={payment.id} className="flex justify-between items-center py-2 border-b last:border-0">
                      <div>
                        <p className="font-medium">{formatDate(payment.created_at)}</p>
                        <p className="text-sm text-gray-600">Due: {formatDate(payment.due_date)}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-medium">{formatCurrency(payment.amount)}</p>
                        <p className={`text-sm ${
                          payment.status === 'succeeded' ? 'text-green-600' : 
                          payment.status === 'failed' ? 'text-red-600' : 
                          'text-yellow-600'
                        }`}>
                          {payment.status.charAt(0).toUpperCase() + payment.status.slice(1)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
                <Link href="/tenant/payment-history" className="block mt-4">
                  <Button variant="link" className="p-0">
                    View all payments →
                  </Button>
                </Link>
              </CardContent>
            </Card>
          )}
        </div>
      </main>
    </div>
  )
} 