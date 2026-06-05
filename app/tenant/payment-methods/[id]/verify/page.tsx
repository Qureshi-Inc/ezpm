import { getCurrentTenant } from '@/lib/auth'
import { createServerSupabaseClient } from '@/lib/supabase'
import { redirect } from 'next/navigation'
import { Navigation } from '@/components/layout/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { VerifyMicrodepositsForm } from '@/components/forms/VerifyMicrodepositsForm'
import Link from 'next/link'
import { ArrowLeft, Building } from 'lucide-react'

interface VerifyPageProps {
  params: Promise<{ id: string }>
}

export default async function VerifyMicrodepositsPage({ params }: VerifyPageProps) {
  const tenant = await getCurrentTenant()
  if (!tenant) {
    redirect('/auth/start')
  }

  const { id } = await params
  const supabase = createServerSupabaseClient()

  const { data: pm } = await supabase
    .from('payment_methods')
    .select('id, tenant_id, type, last4, bank_name, verification_status')
    .eq('id', id)
    .eq('tenant_id', tenant.id)
    .maybeSingle()

  if (!pm) {
    redirect('/tenant/payment-methods')
  }
  if (pm.verification_status === 'verified') {
    redirect('/tenant/payment-methods?message=already_verified')
  }
  if (pm.verification_status === 'failed') {
    redirect('/tenant/payment-methods?message=verification_failed')
  }

  return (
    <div className="min-h-screen bg-background">
      <Navigation role="tenant" userName={tenant.first_name} />

      <main className="max-w-2xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
        <div className="py-6">
          <div className="mb-6">
            <Link href="/tenant/payment-methods" className="flex items-center text-primary hover:text-primary mb-4">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Payment Methods
            </Link>
            <h1 className="font-display text-3xl font-medium tracking-tight text-foreground">Verify Bank Account</h1>
            <p className="text-muted-foreground mt-2">
              Confirm the two small deposits Stripe sent to your account so we can activate it for rent payments.
            </p>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-3">
                <div className="w-10 h-10 bg-accent rounded-full flex items-center justify-center">
                  <Building className="w-5 h-5 text-primary" />
                </div>
                <span>{pm.bank_name || 'Bank account'} ••••{pm.last4 ?? '••••'}</span>
              </CardTitle>
              <CardDescription>Pending verification</CardDescription>
            </CardHeader>
            <CardContent>
              <VerifyMicrodepositsForm paymentMethodId={pm.id} last4={pm.last4} />
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  )
}
