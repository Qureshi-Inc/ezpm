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
    redirect('/auth/start')
  }

  const supabase = createServerSupabaseClient()

  // Next open invoice (Stripe-driven, replaces the old 'pending' status).
  const { data: nextPayment } = await supabase
    .from('payments')
    .select('id, amount, due_date, status')
    .eq('tenant_id', tenant.id)
    .in('status', ['open', 'failed', 'processing'])
    .order('due_date', { ascending: true })
    .limit(1)
    .maybeSingle()

  const { data: recentPayments } = await supabase
    .from('payments')
    .select('id, amount, status, due_date, paid_at, created_at')
    .eq('tenant_id', tenant.id)
    .order('created_at', { ascending: false })
    .limit(5)

  const { count: paymentMethodsCount } = await supabase
    .from('payment_methods')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', tenant.id)

  const autoPayActive = !!tenant.stripe_subscription_id

  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation role="tenant" userName={tenant.first_name} />

      <main className="max-w-7xl mx-auto py-3 sm:py-6 px-4 sm:px-6 lg:px-8">
        <div className="py-3 sm:py-6">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-6 sm:mb-8">
            Welcome back, {tenant.first_name}!
          </h1>

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
                <p className="text-2xl font-bold mt-2">{formatCurrency(tenant.property.rent_amount)}/month</p>
                <p className="text-sm text-gray-600 mt-2">
                  Payment due: {ordinal(tenant.payment_due_day)} of each month
                </p>
              </CardContent>
            </Card>
          )}

          <div className="grid grid-cols-1 gap-4 sm:gap-6 md:grid-cols-2 lg:grid-cols-3">
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
                    <p className="text-gray-500 mb-4">You&apos;re all caught up.</p>
                    <Link href="/tenant/pay">
                      <Button variant="outline" className="w-full">View open invoice</Button>
                    </Link>
                  </>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Payment Methods</CardTitle>
                <CardDescription>
                  {paymentMethodsCount || 0} method{paymentMethodsCount !== 1 ? 's' : ''} saved
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Link href="/tenant/payment-methods">
                  <Button variant="outline" className="w-full">Manage Payment Methods</Button>
                </Link>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Auto Pay</CardTitle>
                <CardDescription>{autoPayActive ? 'Active' : 'Not active yet'}</CardDescription>
              </CardHeader>
              <CardContent>
                {autoPayActive ? (
                  <p className="text-sm text-gray-600">
                    Your default payment method is charged automatically on the {ordinal(tenant.payment_due_day)} of each
                    month by Stripe. No action needed.
                  </p>
                ) : (
                  <>
                    <p className="text-sm text-gray-600 mb-3">
                      Add a payment method to enable monthly auto-charge.
                    </p>
                    <Link href="/tenant/payment-methods/add">
                      <Button variant="outline" className="w-full">Add Payment Method</Button>
                    </Link>
                  </>
                )}
              </CardContent>
            </Card>
          </div>

          {recentPayments && recentPayments.length > 0 && (
            <Card className="mt-6">
              <CardHeader>
                <CardTitle>Recent Payments</CardTitle>
                <CardDescription>Your last 5 invoices</CardDescription>
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
                        <p className={statusColor(payment.status)}>
                          {capitalize(payment.status)}
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

function ordinal(n: number): string {
  if (n === 1) return '1st'
  if (n === 2) return '2nd'
  if (n === 3) return '3rd'
  return `${n}th`
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function statusColor(status: string): string {
  if (status === 'succeeded') return 'text-sm text-green-600'
  if (status === 'failed' || status === 'uncollectible') return 'text-sm text-red-600'
  if (status === 'processing') return 'text-sm text-blue-600'
  return 'text-sm text-yellow-600' // open / void
}
