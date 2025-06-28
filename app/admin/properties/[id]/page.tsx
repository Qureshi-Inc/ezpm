import { requireAdmin } from '@/lib/auth'
import { createServerSupabaseClient } from '@/lib/supabase'
import { redirect } from 'next/navigation'
import { Navigation } from '@/components/layout/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { formatCurrency, formatDate } from '@/utils/helpers'
import { PropertyActions } from '@/components/admin/PropertyActions'
import Link from 'next/link'
import { ArrowLeft, Building, MapPin, DollarSign, Users, Edit, User, CheckCircle } from 'lucide-react'

interface PropertyDetailsPageProps {
  params: Promise<{
    id: string
  }>
  searchParams: Promise<{
    message?: string
  }>
}

export default async function PropertyDetailsPage({ params, searchParams }: PropertyDetailsPageProps) {
  try {
    const session = await requireAdmin()
    const supabase = createServerSupabaseClient()
    
    // Await params to fix Next.js 15 compatibility
    const { id } = await params
    const { message } = await searchParams

    // Get property details
    const { data: property, error } = await supabase
      .from('properties')
      .select('*')
      .eq('id', id)
      .single()

    if (error || !property) {
      redirect('/admin/properties')
    }

    // Get tenants assigned to this property
    const { data: tenants } = await supabase
      .from('tenants')
      .select(`
        *,
        user:users(email)
      `)
      .eq('property_id', id)
      .order('created_at', { ascending: false })

    // Get recent payments for this property
    const { data: recentPayments } = await supabase
      .from('payments')
      .select(`
        *,
        tenant:tenants(first_name, last_name)
      `)
      .eq('property_id', id)
      .order('created_at', { ascending: false })
      .limit(5)

    return (
      <div className="min-h-screen bg-gray-50">
        <Navigation role="admin" userName="Admin" />
        
        <main className="max-w-4xl mx-auto py-6 sm:px-6 lg:px-8">
          <div className="px-4 py-6 sm:px-0">
            <div className="mb-6">
              <Link href="/admin/properties" className="flex items-center text-blue-600 hover:text-blue-700 mb-4">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Properties
              </Link>
              
              {message === 'property_updated' && (
                <div className="mb-4 p-3 text-sm text-green-600 bg-green-50 border border-green-200 rounded-lg flex items-center space-x-2">
                  <CheckCircle className="w-4 h-4 flex-shrink-0" />
                  <span>Property updated successfully!</span>
                </div>
              )}
              
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="text-3xl font-bold text-gray-900">{property.address}</h1>
                  {property.unit_number && (
                    <p className="text-gray-600 mt-1">Unit {property.unit_number}</p>
                  )}
                  <p className="text-gray-600 mt-2">Property Details</p>
                </div>
                <div className="min-w-[200px]">
                  <PropertyActions property={property} />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Property Information */}
              <div className="lg:col-span-2 space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center space-x-2">
                      <Building className="w-5 h-5" />
                      <span>Property Information</span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-center space-x-2">
                      <MapPin className="w-4 h-4 text-gray-400" />
                      <div>
                        <p className="text-sm font-medium text-gray-500">Address</p>
                        <p className="text-lg">{property.address}</p>
                      </div>
                    </div>
                    
                    {property.unit_number && (
                      <div>
                        <p className="text-sm font-medium text-gray-500">Unit Number</p>
                        <p className="text-lg">{property.unit_number}</p>
                      </div>
                    )}

                    <div className="flex items-center space-x-2 text-green-600">
                      <DollarSign className="w-4 h-4" />
                      <div>
                        <p className="text-sm font-medium text-gray-500">Monthly Rent</p>
                        <p className="text-lg font-bold">{formatCurrency(property.rent_amount)}</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      {property.bedrooms && (
                        <div>
                          <p className="text-sm font-medium text-gray-500">Bedrooms</p>
                          <p>{property.bedrooms}</p>
                        </div>
                      )}
                      {property.bathrooms && (
                        <div>
                          <p className="text-sm font-medium text-gray-500">Bathrooms</p>
                          <p>{property.bathrooms}</p>
                        </div>
                      )}
                    </div>

                    {property.description && (
                      <div>
                        <p className="text-sm font-medium text-gray-500">Description</p>
                        <p className="text-gray-700">{property.description}</p>
                      </div>
                    )}

                    <div>
                      <p className="text-sm font-medium text-gray-500">Property Added</p>
                      <p>{formatDate(property.created_at)}</p>
                    </div>
                  </CardContent>
                </Card>

                {/* Assigned Tenants */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center space-x-2">
                      <Users className="w-5 h-5" />
                      <span>Assigned Tenants</span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {tenants && tenants.length > 0 ? (
                      <div className="space-y-3">
                        {tenants.map((tenant) => (
                          <div key={tenant.id} className="flex items-center justify-between p-3 border rounded-lg">
                            <div className="flex items-center space-x-3">
                              <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                                <User className="w-5 h-5 text-blue-600" />
                              </div>
                              <div>
                                <p className="font-medium text-gray-900">
                                  {tenant.first_name} {tenant.last_name}
                                </p>
                                <p className="text-sm text-gray-600">{tenant.user?.email}</p>
                              </div>
                            </div>
                            <Link href={`/admin/tenants/${tenant.id}`}>
                              <Button variant="outline" size="sm">
                                View Details
                              </Button>
                            </Link>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-6">
                        <Users className="w-12 h-12 text-gray-300 mx-auto mb-2" />
                        <p className="text-gray-600">No tenants assigned</p>
                        <Button variant="outline" size="sm" className="mt-2">
                          Assign Tenant
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* Sidebar */}
              <div className="space-y-6">
                {/* Quick Stats */}
                <Card>
                  <CardHeader>
                    <CardTitle>Quick Stats</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">Occupancy</span>
                      <Badge variant={tenants && tenants.length > 0 ? "default" : "secondary"}>
                        {tenants && tenants.length > 0 ? "Occupied" : "Vacant"}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">Tenants</span>
                      <span className="font-medium">{tenants?.length || 0}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">Monthly Revenue</span>
                      <span className="font-medium text-green-600">
                        {formatCurrency(property.rent_amount)}
                      </span>
                    </div>
                  </CardContent>
                </Card>

                {/* Quick Actions */}
                <Card>
                  <CardHeader>
                    <CardTitle>Quick Actions</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <Button variant="outline" size="sm" className="w-full justify-start">
                      <Users className="w-4 h-4 mr-2" />
                      Manage Tenants
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
                              <p className="text-xs text-gray-500">
                                {payment.tenant?.first_name} {payment.tenant?.last_name}
                              </p>
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