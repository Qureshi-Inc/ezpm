import { getCurrentTenant } from '@/lib/auth'
import { createServerSupabaseClient } from '@/lib/supabase'
import { redirect } from 'next/navigation'
import { Navigation } from '@/components/layout/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
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

  const { count: openMaintenanceCount } = await supabase
    .from('maintenance_requests')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', tenant.id)
    .in('status', ['open', 'in_progress'])

  const { data: latestAnnouncement } = await supabase
    .from('announcements')
    .select('id, title, body, created_at')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const autoPayActive = !!tenant.stripe_subscription_id

  return (
    <div className="min-h-screen bg-background">
      <Navigation role="tenant" userName={tenant.first_name} />

      <main className="max-w-6xl mx-auto py-8 sm:py-12 px-4 sm:px-6 lg:px-8">
        <div className="mb-8">
          <p className="text-sm font-medium text-primary mb-1">Tenant portal</p>
          <h1 className="font-display text-3xl sm:text-4xl font-medium tracking-tight text-foreground">
            Welcome back, {tenant.first_name}.
          </h1>
        </div>

        {latestAnnouncement && (
          <Link href="/tenant/announcements" className="block mb-5">
            <div className="flex items-start gap-3 rounded-2xl border border-primary/20 bg-primary/5 p-4 transition-colors hover:bg-primary/10">
              <span className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary text-base">📣</span>
              <div className="min-w-0">
                <p className="text-xs font-medium uppercase tracking-wide text-primary">Announcement</p>
                <p className="font-medium text-foreground truncate">{latestAnnouncement.title}</p>
                <p className="text-sm text-muted-foreground line-clamp-2">{latestAnnouncement.body}</p>
              </div>
            </div>
          </Link>
        )}

        {/* Hero: next payment + property, side by side on desktop */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-5 mb-5">
          {/* Next payment — the primary action, teal hero card */}
          <Card className="lg:col-span-3 overflow-hidden border-transparent bg-gradient-to-br from-primary to-[hsl(183,83%,21%)] text-primary-foreground shadow-card">
            <CardContent className="p-7 sm:p-8">
              {nextPayment ? (
                <>
                  <p className="text-sm font-medium text-primary-foreground/70">
                    {nextPayment.status === 'failed' ? 'Payment failed — retry' : 'Next payment due'}
                    {' · '}{formatDate(nextPayment.due_date)}
                  </p>
                  <p className="font-display text-5xl sm:text-6xl font-medium mt-2 tracking-tight">
                    {formatCurrency(nextPayment.amount)}
                  </p>
                  <Link href="/tenant/pay" className="inline-block mt-6">
                    <Button size="lg" className="bg-card text-primary hover:bg-card hover:brightness-100 hover:-translate-y-0.5">
                      Pay now
                      <span aria-hidden>→</span>
                    </Button>
                  </Link>
                </>
              ) : (
                <>
                  <p className="text-sm font-medium text-primary-foreground/70">Account status</p>
                  <p className="font-display text-4xl sm:text-5xl font-medium mt-2 tracking-tight">
                    You&apos;re all caught up
                  </p>
                  <p className="text-primary-foreground/80 mt-3 text-sm">
                    No open invoices right now. We&apos;ll let you know when the next one is ready.
                  </p>
                  <Link href="/tenant/pay" className="inline-block mt-6">
                    <Button size="lg" variant="outline" className="border-primary-foreground/40 bg-transparent text-primary-foreground hover:bg-primary-foreground/10 hover:border-primary-foreground/40">
                      View invoices
                    </Button>
                  </Link>
                </>
              )}
            </CardContent>
          </Card>

          {/* Property */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardDescription className="text-xs uppercase tracking-wider font-semibold">Your residence</CardDescription>
            </CardHeader>
            <CardContent>
              {tenant.property ? (
                <>
                  <p className="font-display text-xl font-medium text-foreground leading-snug">
                    {tenant.property.address}
                  </p>
                  {tenant.property.unit_number && (
                    <p className="text-muted-foreground text-sm">Unit {tenant.property.unit_number}</p>
                  )}
                  <div className="mt-4 pt-4 border-t border-border/70">
                    <p className="text-2xl font-semibold text-foreground">
                      {formatCurrency(tenant.property.rent_amount)}
                      <span className="text-sm font-normal text-muted-foreground">/month</span>
                    </p>
                    <p className="text-sm text-muted-foreground mt-1">
                      Due the {ordinal(tenant.payment_due_day)} of each month
                    </p>
                  </div>
                </>
              ) : (
                <p className="text-muted-foreground text-sm">No property assigned yet. Your landlord will set this up.</p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Secondary: payment methods + auto-pay + maintenance + documents */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          <Card className="lift">
            <CardHeader>
              <CardTitle className="text-lg">Payment methods</CardTitle>
              <CardDescription>
                {paymentMethodsCount || 0} saved
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Link href="/tenant/payment-methods">
                <Button variant="outline" className="w-full">Manage methods</Button>
              </Link>
            </CardContent>
          </Card>

          <Card className="lift">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">Auto-pay</CardTitle>
                <Badge variant={autoPayActive ? 'success' : 'warning'}>
                  {autoPayActive ? 'Active' : 'Not set up'}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              {autoPayActive ? (
                <p className="text-sm text-muted-foreground">
                  Charged automatically on the {ordinal(tenant.payment_due_day)} each month. Nothing to do.
                </p>
              ) : (
                <>
                  <p className="text-sm text-muted-foreground mb-3">
                    Add a payment method to enable monthly auto-charge.
                  </p>
                  <Link href="/tenant/payment-methods/add">
                    <Button variant="outline" className="w-full">Add payment method</Button>
                  </Link>
                </>
              )}
            </CardContent>
          </Card>

          <Card className="lift">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">Maintenance</CardTitle>
                {(openMaintenanceCount || 0) > 0 && (
                  <Badge variant="warning">{openMaintenanceCount} open</Badge>
                )}
              </div>
              <CardDescription>Report an issue with your place</CardDescription>
            </CardHeader>
            <CardContent>
              <Link href="/tenant/maintenance">
                <Button variant="outline" className="w-full">View requests</Button>
              </Link>
            </CardContent>
          </Card>

          <Card className="lift">
            <CardHeader>
              <CardTitle className="text-lg">Documents</CardTitle>
              <CardDescription>Leases, insurance &amp; shared files</CardDescription>
            </CardHeader>
            <CardContent>
              <Link href="/tenant/documents">
                <Button variant="outline" className="w-full">View documents</Button>
              </Link>
            </CardContent>
          </Card>
        </div>

        {recentPayments && recentPayments.length > 0 && (
          <Card className="mt-5">
            <CardHeader>
              <CardTitle className="text-lg">Recent payments</CardTitle>
              <CardDescription>Your last 5 invoices</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="divide-y divide-border/70">
                {recentPayments.map((payment) => (
                  <div key={payment.id} className="flex justify-between items-center py-3 first:pt-0 last:pb-0">
                    <div>
                      <p className="font-medium text-foreground">{formatDate(payment.created_at)}</p>
                      <p className="text-sm text-muted-foreground">Due {formatDate(payment.due_date)}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <p className="font-semibold text-foreground tabular-nums">{formatCurrency(payment.amount)}</p>
                      <Badge variant={statusVariant(payment.status)}>{capitalize(payment.status)}</Badge>
                    </div>
                  </div>
                ))}
              </div>
              <Link href="/tenant/payment-history" className="block mt-4">
                <Button variant="link" className="p-0 h-auto">
                  View all payments →
                </Button>
              </Link>
            </CardContent>
          </Card>
        )}
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

function statusVariant(status: string): 'success' | 'destructive' | 'accent' | 'warning' {
  if (status === 'succeeded') return 'success'
  if (status === 'failed' || status === 'uncollectible') return 'destructive'
  if (status === 'processing') return 'accent'
  return 'warning' // open / void
}
