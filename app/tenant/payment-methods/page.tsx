import { getCurrentTenant } from '@/lib/auth'
import { createServerSupabaseClient } from '@/lib/supabase'
import { redirect } from 'next/navigation'
import { Navigation } from '@/components/layout/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { getPaymentMethodIcon } from '@/utils/helpers'
import { PaymentMethodActions } from '@/components/tenant/PaymentMethodActions'
import { PaymentMethodsList } from '@/components/tenant/PaymentMethodsList'
import Link from 'next/link'
import { Plus, CreditCard, Settings, AlertCircle } from 'lucide-react'

export default async function PaymentMethodsPage() {
  const tenant = await getCurrentTenant()
  
  if (!tenant) {
    redirect('/auth/login')
  }

  const supabase = createServerSupabaseClient()

  // Get payment methods for this tenant
  const { data: paymentMethods, error } = await supabase
    .from('payment_methods')
    .select('*')
    .eq('tenant_id', tenant.id)
    .order('created_at', { ascending: false })

  // Get auto payment info
  const { data: autoPayment } = await supabase
    .from('auto_payments')
    .select('*, payment_method:payment_methods(type, last4)')
    .eq('tenant_id', tenant.id)
    .single()

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
            <p className="text-gray-600 mt-2">Manage your payment methods and auto-pay settings</p>
          </div>

          {/* Auto Pay Card */}
          <Card className="mb-4 sm:mb-6">
            <CardHeader>
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-2 sm:space-y-0">
                <div>
                  <CardTitle className="flex items-center space-x-2">
                    <Settings className="w-5 h-5" />
                    <span>Auto Pay</span>
                  </CardTitle>
                  <CardDescription>
                    Automatically pay your rent each month
                  </CardDescription>
                </div>
                <Badge variant={autoPayment?.is_active ? "default" : "secondary"} className="w-fit">
                  {autoPayment?.is_active ? "Enabled" : "Disabled"}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              {autoPayment?.is_active ? (
                <div className="space-y-3">
                  <p className="text-sm text-gray-600">
                    Payments will be automatically processed on day {autoPayment.day_of_month} of each month using:
                  </p>
                  <div className="flex items-center space-x-3 p-3 bg-blue-50 rounded-lg">
                    <span className="text-lg flex-shrink-0">{getPaymentMethodIcon(autoPayment.payment_method?.type || 'card')}</span>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">
                        {autoPayment.payment_method?.type === 'card' ? 'Credit/Debit Card' : 'Bank Account'}
                      </p>
                      <p className="text-sm text-gray-600">
                        ****{autoPayment.payment_method?.last4}
                      </p>
                    </div>
                  </div>
                  <Link href="/tenant/auto-pay/setup">
                    <Button variant="outline" size="sm">
                      Modify Auto Pay
                    </Button>
                  </Link>
                </div>
              ) : (
                <div className="text-center py-6">
                  <p className="text-gray-600 mb-4">
                    Set up automatic payments to never miss your rent due date.
                  </p>
                  {paymentMethods && paymentMethods.length > 0 ? (
                    <Link href="/tenant/auto-pay/setup">
                      <Button>Set Up Auto Pay</Button>
                    </Link>
                  ) : (
                    <Button disabled>Add Payment Method First</Button>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Payment Integration Notice */}
          <Card className="mb-4 sm:mb-6 border-blue-200 bg-blue-50">
            <CardContent className="pt-6">
              <div className="flex items-start space-x-3">
                <AlertCircle className="w-5 h-5 text-blue-600 mt-0.5" />
                <div>
                  <h3 className="font-medium text-blue-900">Payment Method Options</h3>
                  <p className="text-sm text-blue-800 mt-1">
                    We offer two secure payment options: Credit/Debit cards through Stripe (with processing fees), 
                    or ACH bank transfers through Moov (no fees). Choose the option that works best for you.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Processing Fee Notice */}
          <Card className="mb-4 sm:mb-6 border-amber-200 bg-amber-50">
            <CardContent className="pt-6">
              <div>
                <h3 className="font-medium text-amber-900 mb-2">Processing Fees</h3>
                <p className="text-sm text-amber-800 mb-3">
                  Payment processing fees vary by method:
                </p>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between items-center">
                    <span className="text-amber-700">• Credit/Debit Cards</span>
                    <span className="font-medium text-amber-900">2.9% + $0.30</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-amber-700">• Bank Account (ACH)</span>
                    <span className="font-medium text-green-900">No fee</span>
                  </div>
                </div>
                <p className="text-xs text-amber-700 mt-3">
                  Example: $1,000 rent + credit card = $1,029.30 total | Bank ACH = $1,000.00 (no fee)
                </p>
              </div>
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
                  Add a payment method to start paying rent online.
                </p>
                <Link href="/tenant/payment-methods/add-new">
                  <Button>
                    <Plus className="w-4 h-4 mr-2" />
                    Add New Payment Method
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
                      Manage your saved payment methods for rent payments
                    </CardDescription>
                  </div>
                  <Link href="/tenant/payment-methods/add-new">
                    <Button size="sm">
                      <Plus className="w-4 h-4 mr-2" />
                      Add New
                    </Button>
                  </Link>
                </div>
              </CardHeader>
              <CardContent>
                <PaymentMethodsList 
                  paymentMethods={paymentMethods} 
                  moovAccountId={tenant.moov_account_id}
                />
              </CardContent>
            </Card>
          )}

          {/* Instructions */}
          <Card className="mt-4 sm:mt-6">
            <CardContent className="pt-6">
              <h3 className="font-medium text-gray-900 mb-2">Accepted Payment Methods</h3>
              <div className="text-sm text-gray-600 space-y-1">
                <p>• Credit Cards (Visa, Mastercard, American Express) - via Stripe</p>
                <p>• Debit Cards - via Stripe</p>
                <p>• Bank Account (US Bank Account) - via Stripe</p>
                <p>• Bank Account (ACH Transfer) - via Moov</p>
              </div>
              <p className="text-xs text-gray-500 mt-3">
                All payments are processed securely. Stripe handles card and US bank account payments with 
                industry-standard encryption. Moov processes ACH bank transfers as a licensed money transmitter. 
                Your payment information is never stored on our servers.
              </p>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  )
} 