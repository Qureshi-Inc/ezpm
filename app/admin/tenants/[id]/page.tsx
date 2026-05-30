import { requireAdmin } from '@/lib/auth'
import { createServerSupabaseClient } from '@/lib/supabase'
import { redirect } from 'next/navigation'
import { Navigation } from '@/components/layout/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { formatCurrency, formatDate } from '@/utils/helpers'
import { TenantActions } from '@/components/admin/TenantActions'
import Link from 'next/link'
import { ArrowLeft, User, Mail, Phone, Building, DollarSign, Edit } from 'lucide-react'

interface TenantDetailsPageProps {
  params: Promise<{
    id: string
  }>
}

export default async function TenantDetailsPage({ params }: TenantDetailsPageProps) {
  try {
    const session = await requireAdmin()
    const supabase = createServerSupabaseClient()
    
    // Await params to fix Next.js 15 compatibility
    const { id } = await params

    const { data: tenant, error: tenantError } = await supabase
      .from('tenants')
      .select('*')
      .eq('id', id)
      .single()

    if (tenantError || !tenant) {
      redirect('/admin/tenants')
    }

    // Linked Zitadel user info (if tenant has logged in at least once)
    let user: { email: string; created_at: string; zitadel_subject: string } | null = null
    if (tenant.user_id) {
      const { data: userData } = await supabase
        .from('users')
        .select('email, created_at, zitadel_subject')
        .eq('id', tenant.user_id)
        .maybeSingle()
      user = userData
    }

    let property = null
    if (tenant.property_id) {
      const { data: propertyData } = await supabase
        .from('properties')
        .select('address, unit_number, rent_amount')
        .eq('id', tenant.property_id)
        .maybeSingle()
      property = propertyData
    }

    const tenantWithRelations = {
      ...tenant,
      user,
      property,
    }

    // Recent payments: tenant_id is on the payments table directly (no leases
    // table — that was dead code referring to a table that never existed in
    // the schema).
    const { data: recentPayments } = await supabase
      .from('payments')
      .select('*')
      .eq('tenant_id', id)
      .order('due_date', { ascending: false })
      .limit(5)

    return (
      <div className="min-h-screen bg-gray-50">
        <Navigation role="admin" userName="Admin" />
        
        <main className="max-w-4xl mx-auto py-6 sm:px-6 lg:px-8">
          <div className="px-4 py-6 sm:px-0">
            <div className="mb-6">
              <Link href="/admin/tenants" className="flex items-center text-blue-600 hover:text-blue-700 mb-4">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Tenants
              </Link>
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="text-3xl font-bold text-gray-900">
                    {tenantWithRelations.first_name} {tenantWithRelations.last_name}
                  </h1>
                  <p className="text-gray-600 mt-2">Tenant Details</p>
                </div>
                <div className="min-w-[200px]">
                  <TenantActions tenant={tenantWithRelations} />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Tenant Information */}
              <div className="lg:col-span-2 space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center space-x-2">
                      <User className="w-5 h-5" />
                      <span>Personal Information</span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-sm font-medium text-gray-500">First Name</p>
                        <p className="text-lg">{tenantWithRelations.first_name}</p>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-500">Last Name</p>
                        <p className="text-lg">{tenantWithRelations.last_name}</p>
                      </div>
                    </div>

                    <div className="flex items-center space-x-2">
                      <Mail className="w-4 h-4 text-gray-400" />
                      <div>
                        <p className="text-sm font-medium text-gray-500">Email</p>
                        <p>{tenantWithRelations.email}</p>
                        {!tenantWithRelations.user_id && (
                          <p className="text-xs text-amber-700">
                            Tenant has not yet logged in via Zitadel.
                          </p>
                        )}
                      </div>
                    </div>

                    {tenantWithRelations.phone && (
                      <div className="flex items-center space-x-2">
                        <Phone className="w-4 h-4 text-gray-400" />
                        <div>
                          <p className="text-sm font-medium text-gray-500">Phone</p>
                          <p>{tenantWithRelations.phone}</p>
                        </div>
                      </div>
                    )}

                    <div className="flex items-center space-x-2">
                      <DollarSign className="w-4 h-4 text-gray-400" />
                      <div>
                        <p className="text-sm font-medium text-gray-500">Payment Due Day</p>
                        <p>{tenantWithRelations.payment_due_day === 1 ? '1st' : tenantWithRelations.payment_due_day === 2 ? '2nd' : tenantWithRelations.payment_due_day === 3 ? '3rd' : `${tenantWithRelations.payment_due_day}th`} of each month</p>
                      </div>
                    </div>

                    <div>
                      <p className="text-sm font-medium text-gray-500">Account Created</p>
                      <p>{formatDate(tenantWithRelations.created_at)}</p>
                    </div>
                  </CardContent>
                </Card>

                {/* Property Assignment */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center space-x-2">
                      <Building className="w-5 h-5" />
                      <span>Property Assignment</span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {tenantWithRelations.property ? (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-medium text-gray-900">{tenantWithRelations.property.address}</p>
                            {tenantWithRelations.property.unit_number && (
                              <p className="text-gray-600">Unit {tenantWithRelations.property.unit_number}</p>
                            )}
                          </div>
                          <Badge variant="default">Assigned</Badge>
                        </div>
                        <div className="flex items-center space-x-2 text-green-600">
                          <DollarSign className="w-4 h-4" />
                          <span className="font-medium">{formatCurrency(tenantWithRelations.property.rent_amount)}/month</span>
                        </div>
                      </div>
                    ) : (
                      <div className="text-center py-6">
                        <Building className="w-12 h-12 text-gray-300 mx-auto mb-2" />
                        <p className="text-gray-600">No property assigned</p>
                        <Button variant="outline" size="sm" className="mt-2">
                          Assign Property
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* Sidebar */}
              <div className="space-y-6">
                {/* Quick Actions */}
                <Card>
                  <CardHeader>
                    <CardTitle>Quick Actions</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <Button variant="outline" size="sm" className="w-full justify-start">
                      <Building className="w-4 h-4 mr-2" />
                      {tenantWithRelations.property ? 'Change Property' : 'Assign Property'}
                    </Button>
                    <Button variant="outline" size="sm" className="w-full justify-start">
                      <DollarSign className="w-4 h-4 mr-2" />
                      View Payments
                    </Button>
                  </CardContent>
                </Card>

                {/* Recent Payments */}
                <Card>
                  <CardHeader>
                    <CardTitle>Recent Payments</CardTitle>
                    <CardDescription>Latest payment activity</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {recentPayments && recentPayments.length > 0 ? (
                      <div className="space-y-3">
                        {recentPayments.slice(0, 3).map((payment) => (
                          <div key={payment.id} className="flex items-center justify-between">
                            <div>
                              <p className="text-sm font-medium">{formatCurrency(payment.amount)}</p>
                              <p className="text-xs text-gray-500">{formatDate(payment.created_at)}</p>
                            </div>
                            <Badge 
                              variant={payment.status === 'succeeded' ? 'default' : 
                                      payment.status === 'failed' ? 'destructive' : 'secondary'}
                            >
                              {payment.status}
                            </Badge>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-gray-500">No payments yet</p>
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
        </main>
      </div>
    )
  } catch (error) {
    redirect('/api/auth/signin')
  }
} 