import { getCurrentTenant } from '@/lib/auth'
import { createServerSupabaseClient } from '@/lib/supabase'
import { redirect } from 'next/navigation'
import { Navigation } from '@/components/layout/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { formatCurrency } from '@/utils/helpers'
import { StripePaymentForm } from '@/components/forms/StripePaymentForm'
import Link from 'next/link'
import { CreditCard, ArrowLeft, AlertCircle } from 'lucide-react'

export default async function PayPage() {
  const tenant = await getCurrentTenant()
  
  if (!tenant) {
    redirect('/auth/login')
  }

  const supabase = createServerSupabaseClient()

  // Get next payment due (pending or failed)
  const { data: nextPayment } = await supabase
    .from('payments')
    .select('*')
    .eq('tenant_id', tenant.id)
    .in('status', ['pending', 'failed'])
    .order('due_date', { ascending: true })
    .limit(1)
    .single()

  // Get payment methods
  const { data: paymentMethods } = await supabase
    .from('payment_methods')
    .select('*')
    .eq('tenant_id', tenant.id)
    .order('is_default', { ascending: false })

  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation role="tenant" userName={tenant.first_name} />
      
      <main className="max-w-2xl mx-auto py-3 sm:py-6 px-4 sm:px-6 lg:px-8">
        <div className="py-3 sm:py-6">
          <div className="mb-4 sm:mb-6">
            <Link href="/tenant" className="flex items-center text-blue-600 hover:text-blue-700 mb-3 sm:mb-4">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Dashboard
            </Link>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Make Payment</h1>
            <p className="text-gray-600 mt-2">Pay your rent securely online</p>
          </div>

          {nextPayment ? (
            <div className="space-y-4 sm:space-y-6">
              {/* Payment Details */}
              <Card className={nextPayment.status === 'failed' ? 'border-red-200 bg-red-50' : ''}>
                <CardHeader>
                  <CardTitle className="flex items-center space-x-2">
                    {nextPayment.status === 'failed' && (
                      <AlertCircle className="w-5 h-5 text-red-600" />
                    )}
                    <span>
                      {nextPayment.status === 'failed' ? 'Payment Retry Required' : 'Payment Due'}
                    </span>
                  </CardTitle>
                  <CardDescription>
                    {nextPayment.status === 'failed' 
                      ? 'Your previous payment failed. Please try again with a different payment method.'
                      : 'Your next rent payment'
                    }
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex justify-between items-center">
                      <span className="text-gray-600">Amount Due:</span>
                      <span className="text-2xl font-bold text-gray-900">
                        {formatCurrency(nextPayment.amount)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-600">Due Date:</span>
                      <span className="font-medium">
                        {new Date(nextPayment.due_date).toLocaleDateString()}
                      </span>
                    </div>
                    {tenant.property && (
                      <div className="flex justify-between items-center">
                        <span className="text-gray-600">Property:</span>
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
                <StripePaymentForm 
                  payment={nextPayment}
                  paymentMethods={paymentMethods}
                  tenantId={tenant.id}
                />
              ) : (
                <Card className="border-amber-200 bg-amber-50">
                  <CardContent className="pt-6">
                    <div className="flex items-start space-x-3">
                      <AlertCircle className="w-5 h-5 text-amber-600 mt-0.5" />
                      <div>
                        <h3 className="font-medium text-amber-900">No Payment Methods</h3>
                        <p className="text-sm text-amber-800 mt-1">
                          You need to add a payment method before you can make a payment.
                        </p>
                        <Link href="/tenant/payment-methods/add-new" className="inline-block mt-3">
                          <Button size="sm">
                            Add Payment Method
                          </Button>
                        </Link>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Instructions */}
              <Card>
                <CardContent className="pt-6">
                  <h3 className="font-medium text-gray-900 mb-2">Payment Information</h3>
                  <div className="text-sm text-gray-600 space-y-1">
                    <p>• Credit/debit cards are processed securely through Stripe (2.9% + $0.30 fee)</p>
                    <p>• Bank accounts (ACH) are processed through Moov with no fees</p>
                    <p>• You'll receive an email confirmation once payment is complete</p>
                    <p>• Bank transfers may take 1-3 business days to process</p>
                    <p>• Credit/debit card payments are processed immediately</p>
                  </div>
                </CardContent>
              </Card>
            </div>
          ) : (
            <Card>
              <CardContent className="text-center py-12">
                <CreditCard className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">No payments due</h3>
                <p className="text-gray-600">
                  You're all caught up! No pending payments at this time.
                </p>
                <Link href="/tenant" className="inline-block mt-4">
                  <Button variant="outline">
                    Return to Dashboard
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