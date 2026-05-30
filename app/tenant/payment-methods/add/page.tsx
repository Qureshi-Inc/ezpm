import { getCurrentTenant } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { Navigation } from '@/components/layout/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { AddPaymentMethodForm } from '@/components/forms/AddPaymentMethodForm'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

export default async function AddPaymentMethodPage() {
  const tenant = await getCurrentTenant()
  if (!tenant) {
    redirect('/auth/start')
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation role="tenant" userName={tenant.first_name} />

      <main className="max-w-2xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
        <div className="py-6">
          <div className="mb-6">
            <Link href="/tenant/payment-methods" className="flex items-center text-blue-600 hover:text-blue-700 mb-4">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Payment Methods
            </Link>
            <h1 className="text-3xl font-bold text-gray-900">Add Payment Method</h1>
            <p className="text-gray-600 mt-2">
              Add a card or US bank account. Stripe handles the secure entry &mdash;
              your details never touch our servers.
            </p>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Payment Method</CardTitle>
              <CardDescription>
                Bank account is cheaper (0.8% capped at $5). Card is faster but costs 2.9% + $0.30 per charge.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <AddPaymentMethodForm tenantId={tenant.id} />
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  )
}
