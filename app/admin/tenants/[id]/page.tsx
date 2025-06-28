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

    // Get tenant details with property and user info
    const { data: tenant, error } = await supabase
      .from('tenants')
      .select(`
        *,
        user:users(email, created_at),
        property:properties(address, unit_number, rent_amount)
      `)
      .eq('id', id)
      .single()

    if (error || !tenant) {
      redirect('/admin/tenants')
    }

    // Get recent payments for this tenant
    const { data: recentPayments } = await supabase
      .from('payments')
      .select('*')
      .eq('tenant_id', id)
      .order('created_at', { ascending: false })
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
                    {tenant.first_name} {tenant.last_name}
                  </h1>
                  <p className="text-gray-600 mt-2">Tenant Details</p>
                </div>
                <div className="min-w-[200px]">
                  <TenantActions tenant={tenant} />
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
                        <p className="text-lg">{tenant.first_name}</p>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-500">Last Name</p>
                        <p className="text-lg">{tenant.last_name}</p>
                      </div>
                    </div>
                    
                    <div className="flex items-center space-x-2">
                      <Mail className="w-4 h-4 text-gray-400" />
                      <div>
                        <p className="text-sm font-medium text-gray-500">Email</p>
                        <p>{tenant.user?.email}</p>
                      </div>
                    </div>

                    {tenant.phone && (
                      <div className="flex items-center space-x-2">
                        <Phone className="w-4 h-4 text-gray-400" />
                        <div>
                          <p className="text-sm font-medium text-gray-500">Phone</p>
                          <p>{tenant.phone}</p>
                        </div>
                      </div>
                    )}

                    <div className="flex items-center space-x-2">
                      <DollarSign className="w-4 h-4 text-gray-400" />
                      <div>
                        <p className="text-sm font-medium text-gray-500">Payment Due Day</p>
                        <p>{tenant.payment_due_day === 1 ? '1st' : tenant.payment_due_day === 2 ? '2nd' : tenant.payment_due_day === 3 ? '3rd' : `${tenant.payment_due_day}th`} of each month</p>
                      </div>
                    </div>

                    <div>
                      <p className="text-sm font-medium text-gray-500">Account Created</p>
                      <p>{formatDate(tenant.user?.created_at || tenant.created_at)}</p>
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
                    {tenant.property ? (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-medium text-gray-900">{tenant.property.address}</p>
                            {tenant.property.unit_number && (
                              <p className="text-gray-600">Unit {tenant.property.unit_number}</p>
                            )}
                          </div>
                          <Badge variant="default">Assigned</Badge>
                        </div>
                        <div className="flex items-center space-x-2 text-green-600">
                          <DollarSign className="w-4 h-4" />
                          <span className="font-medium">{formatCurrency(tenant.property.rent_amount)}/month</span>
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
                      {tenant.property ? 'Change Property' : 'Assign Property'}
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
    redirect('/auth/login')
  }
} 