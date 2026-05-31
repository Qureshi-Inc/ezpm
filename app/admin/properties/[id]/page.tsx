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
      <div className="min-h-screen bg-background">
        <Navigation role="admin" userName="Admin" />
        
        <main className="max-w-4xl mx-auto py-6 sm:px-6 lg:px-8">
          <div className="px-4 py-6 sm:px-0">
            <div className="mb-6">
              <Link href="/admin/properties" className="flex items-center text-primary hover:text-primary mb-4">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Properties
              </Link>
              
              {message === 'property_updated' && (
                <div className="mb-4 p-3 text-sm text-success bg-success/10 border border-success/30 rounded-lg flex items-center space-x-2">
                  <CheckCircle className="w-4 h-4 flex-shrink-0" />
                  <span>Property updated successfully!</span>
                </div>
              )}
              
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <h1 className="font-display text-2xl sm:text-3xl font-medium tracking-tight text-foreground break-words">{property.address}</h1>
                  {property.unit_number && (
                    <p className="text-muted-foreground mt-1">Unit {property.unit_number}</p>
                  )}
                  <p className="text-muted-foreground mt-2">Property Details</p>
                </div>
                <div className="w-full sm:w-auto sm:min-w-[220px] sm:flex-shrink-0">
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
                      <MapPin className="w-4 h-4 text-muted-foreground" />
                      <div>
                        <p className="text-sm font-medium text-muted-foreground">Address</p>
                        <p className="text-lg">{property.address}</p>
                      </div>
                    </div>
                    
                    {property.unit_number && (
                      <div>
                        <p className="text-sm font-medium text-muted-foreground">Unit Number</p>
                        <p className="text-lg">{property.unit_number}</p>
                      </div>
                    )}

                    <div className="flex items-center space-x-2 text-success">
                      <DollarSign className="w-4 h-4" />
                      <div>
                        <p className="text-sm font-medium text-muted-foreground">Monthly Rent</p>
                        <p className="text-lg font-bold">{formatCurrency(property.rent_amount)}</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      {property.bedrooms && (
                        <div>
                          <p className="text-sm font-medium text-muted-foreground">Bedrooms</p>
                          <p>{property.bedrooms}</p>
                        </div>
                      )}
                      {property.bathrooms && (
                        <div>
                          <p className="text-sm font-medium text-muted-foreground">Bathrooms</p>
                          <p>{property.bathrooms}</p>
                        </div>
                      )}
                    </div>

                    {property.description && (
                      <div>
                        <p className="text-sm font-medium text-muted-foreground">Description</p>
                        <p className="text-foreground">{property.description}</p>
                      </div>
                    )}

                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Property Added</p>
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
                              <div className="w-10 h-10 bg-accent rounded-full flex items-center justify-center">
                                <User className="w-5 h-5 text-primary" />
                              </div>
                              <div>
                                <p className="font-medium text-foreground">
                                  {tenant.first_name} {tenant.last_name}
                                </p>
                                <p className="text-sm text-muted-foreground">{tenant.user?.email}</p>
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
                        <Users className="w-12 h-12 text-muted-foreground/50 mx-auto mb-2" />
                        <p className="text-muted-foreground">No tenants assigned</p>
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
                      <span className="text-sm text-muted-foreground">Occupancy</span>
                      <Badge variant={tenants && tenants.length > 0 ? "default" : "secondary"}>
                        {tenants && tenants.length > 0 ? "Occupied" : "Vacant"}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Tenants</span>
                      <span className="font-medium">{tenants?.length || 0}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Monthly Revenue</span>
                      <span className="font-medium text-success">
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
                              <p className="text-xs text-muted-foreground">
                                {payment.tenant?.first_name} {payment.tenant?.last_name}
                              </p>
                              <p className="text-xs text-muted-foreground">{formatDate(payment.created_at)}</p>
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
                      <p className="text-sm text-muted-foreground">No payments yet</p>
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
    redirect('/auth/start')
  }
} 