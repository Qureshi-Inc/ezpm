import { getCurrentTenant } from '@/lib/auth'
import { createServerSupabaseClient } from '@/lib/supabase'
import { redirect } from 'next/navigation'
import { Navigation } from '@/components/layout/navigation'
import { AutoPaySetupForm } from '@/components/forms/AutoPaySetupForm'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

export default async function AutoPaySetupPage() {
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
    .order('is_default', { ascending: false })

  // Get existing auto payment setup
  const { data: existingAutoPayment } = await supabase
    .from('auto_payments')
    .select('*, payment_method:payment_methods(type, last4, id)')
    .eq('tenant_id', tenant.id)
    .single()

  if (error) {
    console.error('Error fetching payment methods:', error)
  }

  // Redirect if no payment methods
  if (!paymentMethods || paymentMethods.length === 0) {
    redirect('/tenant/payment-methods?message=add_payment_method_first')
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation role="tenant" userName={tenant.first_name} />
      
      <main className="max-w-2xl mx-auto py-3 sm:py-6 px-4 sm:px-6 lg:px-8">
        <div className="py-3 sm:py-6">
          <div className="mb-4 sm:mb-6">
            <Link href="/tenant/payment-methods" className="flex items-center text-blue-600 hover:text-blue-700 mb-3 sm:mb-4">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Payment Methods
            </Link>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">
              {existingAutoPayment ? 'Modify Auto Pay' : 'Set Up Auto Pay'}
            </h1>
            <p className="text-gray-600 mt-2">
              Configure automatic rent payments to never miss a due date
            </p>
          </div>

          <AutoPaySetupForm 
            tenantId={tenant.id}
            paymentMethods={paymentMethods}
            existingAutoPayment={existingAutoPayment}
            paymentDueDay={tenant.payment_due_day || 1}
          />
        </div>
      </main>
    </div>
  )
} 