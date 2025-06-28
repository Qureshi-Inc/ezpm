import { getCurrentTenant } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { Navigation } from '@/components/layout/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { MoovPaymentMethodForm } from '@/components/forms/MoovPaymentMethodForm'
import Link from 'next/link'
import { ArrowLeft, Building2 } from 'lucide-react'

export default async function AddMoovPaymentMethodPage() {
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
            <h1 className="text-3xl font-bold text-gray-900">Add Bank Account (ACH)</h1>
            <p className="text-gray-600 mt-2">Connect your bank account for ACH payments</p>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Building2 className="w-5 h-5" />
                <span>Bank Account Information</span>
              </CardTitle>
              <CardDescription>
                Add your bank account for secure ACH rent payments
              </CardDescription>
            </CardHeader>
            <CardContent>
              <MoovPaymentMethodForm tenantId={tenant.id} />
            </CardContent>
          </Card>

          <Card className="mt-6">
            <CardContent className="pt-6">
              <h3 className="font-medium text-gray-900 mb-2">Security & Privacy</h3>
              <div className="text-sm text-gray-600 space-y-1">
                <p>• All bank account information is encrypted and securely transmitted</p>
                <p>• We never store your full account details on our servers</p>
                <p>• Your payment data is processed by Moov, a licensed money transmitter</p>
                <p>• ACH payments typically take 1-3 business days to process</p>
                <p>• You can modify or remove payment methods at any time</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  )
} 