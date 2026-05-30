import { getCurrentTenant } from '@/lib/auth'
import { createServerSupabaseClient } from '@/lib/supabase'
import { redirect } from 'next/navigation'
import { Navigation } from '@/components/layout/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { PaymentMethodsList } from '@/components/tenant/PaymentMethodsList'
import Link from 'next/link'
import { Plus, CreditCard } from 'lucide-react'

export default async function PaymentMethodsPage() {
  const tenant = await getCurrentTenant()

  if (!tenant) {
    redirect('/auth/start')
  }

  const supabase = createServerSupabaseClient()

  const { data: paymentMethods, error } = await supabase
    .from('payment_methods')
    .select('id, type, last4, bank_name, card_brand, is_default, verification_status')
    .eq('tenant_id', tenant.id)
    .order('is_default', { ascending: false })
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Error fetching payment methods:', error)
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation role="tenant" userName={tenant.first_name} />

      <main className="max-w-4xl mx-auto py-3 sm:py-6 px-4 sm:px-6 lg:px-8">
        <div className="py-3 sm:py-6">
          <div className="mb-6 sm:mb-8">
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Payment Methods</h1>
            <p className="text-gray-600 mt-2">
              Manage the cards and bank accounts used for rent payments. Your
              landlord runs auto-pay through Stripe Subscriptions — your default
              payment method is charged automatically each month.
            </p>
          </div>

          {/* Processing fee notice */}
          <Card className="mb-4 sm:mb-6 border-amber-200 bg-amber-50">
            <CardContent className="pt-6">
              <h3 className="font-medium text-amber-900 mb-2">Processing Fees</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between items-center">
                  <span className="text-amber-700">Credit/Debit Cards</span>
                  <span className="font-medium text-amber-900">2.9% + $0.30</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-amber-700">Bank Account (ACH)</span>
                  <span className="font-medium text-amber-900">0.8% capped at $5.00</span>
                </div>
              </div>
              <p className="text-xs text-amber-700 mt-3">
                Example: $2,000 rent + card = $2,058.30 total | $2,000 rent + ACH = $2,005.00 total.
              </p>
            </CardContent>
          </Card>

          {/* Payment Methods List */}
          {!paymentMethods || paymentMethods.length === 0 ? (
            <Card>
              <CardContent className="text-center py-8">
                <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <CreditCard className="w-8 h-8 text-gray-400" />
                </div>
                <h3 className="text-lg font-medium text-gray-900 mb-2">
                  No payment methods yet
                </h3>
                <p className="text-gray-600 mb-6">
                  Add a card or bank account to start paying rent online.
                </p>
                <Link href="/tenant/payment-methods/add">
                  <Button>
                    <Plus className="w-4 h-4 mr-2" />
                    Add Payment Method
                  </Button>
                </Link>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <div className="flex justify-between items-center">
                  <div>
                    <CardTitle>Your Payment Methods</CardTitle>
                    <CardDescription>
                      The default method is charged for monthly rent.
                    </CardDescription>
                  </div>
                  <Link href="/tenant/payment-methods/add">
                    <Button size="sm">
                      <Plus className="w-4 h-4 mr-2" />
                      Add New
                    </Button>
                  </Link>
                </div>
              </CardHeader>
              <CardContent>
                <PaymentMethodsList paymentMethods={paymentMethods} />
              </CardContent>
            </Card>
          )}
        </div>
      </main>
    </div>
  )
}
