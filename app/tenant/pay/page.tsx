import { getCurrentTenant } from '@/lib/auth'
import { createServerSupabaseClient } from '@/lib/supabase'
import { redirect } from 'next/navigation'
import { Navigation } from '@/components/layout/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { formatCurrency } from '@/utils/helpers'
import { RentPaymentForm } from '@/components/forms/RentPaymentForm'
import Link from 'next/link'
import { CreditCard, ArrowLeft, AlertCircle } from 'lucide-react'

export default async function PayPage() {
  const tenant = await getCurrentTenant()
  if (!tenant) {
    redirect('/auth/start')
  }

  const supabase = createServerSupabaseClient()

  // The "current invoice to pay" is the oldest open/failed payment.
  // Status set comes from Stripe Invoice states we mirror.
  const { data: nextPayment } = await supabase
    .from('payments')
    .select('id, amount, due_date, stripe_invoice_id, status')
    .eq('tenant_id', tenant.id)
    .in('status', ['open', 'failed'])
    .order('due_date', { ascending: true })
    .limit(1)
    .maybeSingle()

  const { data: paymentMethods } = await supabase
    .from('payment_methods')
    .select('id, type, last4, bank_name, card_brand, is_default')
    .eq('tenant_id', tenant.id)
    .order('is_default', { ascending: false })
    .order('created_at', { ascending: false })

  return (
    <div className="min-h-screen bg-background">
      <Navigation role="tenant" userName={tenant.first_name} />

      <main className="max-w-2xl mx-auto py-3 sm:py-6 px-4 sm:px-6 lg:px-8">
        <div className="py-3 sm:py-6">
          <div className="mb-4 sm:mb-6">
            <Link href="/tenant" className="flex items-center text-primary hover:text-primary mb-3 sm:mb-4">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Dashboard
            </Link>
            <h1 className="font-display text-2xl sm:text-3xl font-medium tracking-tight text-foreground">Make Payment</h1>
            <p className="text-muted-foreground mt-2">
              Your monthly rent auto-pays from your default method on the due date. Use this page to settle an open invoice manually
              (e.g. retrying a failed charge).
            </p>
          </div>

          {nextPayment ? (
            <div className="space-y-4 sm:space-y-6">
              <Card className={nextPayment.status === 'failed' ? 'border-destructive/20 bg-destructive/10' : ''}>
                <CardHeader>
                  <CardTitle className="flex items-center space-x-2">
                    {nextPayment.status === 'failed' && <AlertCircle className="w-5 h-5 text-destructive" />}
                    <span>{nextPayment.status === 'failed' ? 'Payment retry required' : 'Open invoice'}</span>
                  </CardTitle>
                  <CardDescription>
                    {nextPayment.status === 'failed'
                      ? 'A previous auto-charge failed. Pick a working payment method and submit.'
                      : 'Your current open Stripe invoice.'}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">Amount due:</span>
                      <span className="font-display text-2xl font-medium tracking-tight text-foreground">{formatCurrency(nextPayment.amount)}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">Due date:</span>
                      <span className="font-medium">{new Date(nextPayment.due_date).toLocaleDateString()}</span>
                    </div>
                    {tenant.property && (
                      <div className="flex justify-between items-center">
                        <span className="text-muted-foreground">Property:</span>
                        <span className="font-medium">
                          {tenant.property.address}
                          {tenant.property.unit_number && ` - Unit ${tenant.property.unit_number}`}
                        </span>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              {paymentMethods && paymentMethods.length > 0 ? (
                <RentPaymentForm payment={nextPayment} paymentMethods={paymentMethods} />
              ) : (
                <Card className="border-warning/20 bg-warning/10">
                  <CardContent className="pt-6">
                    <div className="flex items-start space-x-3">
                      <AlertCircle className="w-5 h-5 text-warning mt-0.5" />
                      <div>
                        <h3 className="font-medium text-warning">No payment methods</h3>
                        <p className="text-sm text-warning mt-1">Add a card or bank account before you can pay.</p>
                        <Link href="/tenant/payment-methods/add" className="inline-block mt-3">
                          <Button size="sm">Add Payment Method</Button>
                        </Link>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          ) : (
            <Card>
              <CardContent className="text-center py-12">
                <CreditCard className="w-16 h-16 text-muted-foreground/50 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-foreground mb-2">No open invoices</h3>
                <p className="text-muted-foreground">You&apos;re all caught up. Stripe will auto-charge on your next due date.</p>
                <Link href="/tenant" className="inline-block mt-4">
                  <Button variant="outline">Return to Dashboard</Button>
                </Link>
              </CardContent>
            </Card>
          )}
        </div>
      </main>
    </div>
  )
}
