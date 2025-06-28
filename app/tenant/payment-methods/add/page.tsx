import { getCurrentTenant } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { Navigation } from '@/components/layout/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { StripePaymentMethodForm } from '@/components/forms/StripePaymentMethodForm'
import { MoovPaymentMethodForm } from '@/components/forms/MoovPaymentMethodForm'
import Link from 'next/link'
import { ArrowLeft, CreditCard, Building2 } from 'lucide-react'

export default async function AddPaymentMethodPage() {
  const tenant = await getCurrentTenant()
  
  if (!tenant) {
    redirect('/auth/login')
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation role="tenant" userName={tenant.first_name} />
      
      <main className="max-w-2xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          <div className="mb-6">
            <Link href="/tenant/payment-methods" className="flex items-center text-blue-600 hover:text-blue-700 mb-4">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Payment Methods
            </Link>
            <h1 className="text-3xl font-bold text-gray-900">Add Payment Method</h1>
            <p className="text-gray-600 mt-2">Add a new payment method for rent payments</p>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Add Credit/Debit Card</CardTitle>
              <CardDescription>
                Add a credit or debit card for rent payments. Cards are processed instantly with a 2.9% + $0.30 processing fee.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <StripePaymentMethodForm tenantId={tenant.id} />
            </CardContent>
          </Card>

          <Card className="mt-6">
            <CardContent className="pt-6">
              <h3 className="font-medium text-gray-900 mb-2">Security & Privacy</h3>
              <div className="text-sm text-gray-600 space-y-1">
                <p>• All payment information is encrypted and securely transmitted</p>
                <p>• We never store your full payment details on our servers</p>
                <p>• Your payment data is processed by Stripe, a PCI-compliant payment processor</p>
                <p>• You can modify or remove payment methods at any time</p>
              </div>
              <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                <p className="text-sm text-yellow-900">
                  <strong>Processing Fee Notice:</strong> Credit and debit card payments are subject to a 
                  2.9% + $0.30 processing fee. This fee will be added to your rent payment amount.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  )
} 