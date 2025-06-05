import { requireAdmin } from '@/lib/auth'
import { createServerSupabaseClient } from '@/lib/supabase'
import { redirect } from 'next/navigation'
import { Navigation } from '@/components/layout/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { formatCurrency } from '@/utils/helpers'
import Link from 'next/link'
import { Plus, Building, MapPin, DollarSign, Users } from 'lucide-react'

export default async function PropertiesPage() {
  try {
    const session = await requireAdmin()
    const supabase = createServerSupabaseClient()

    // Get all properties with tenant count
    const { data: properties, error } = await supabase
      .from('properties')
      .select(`
        *,
        tenants(count)
      `)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Error fetching properties:', error)
    }

    return (
      <div className="min-h-screen bg-gray-50">
        <Navigation role="admin" userName="Admin" />
        
        <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
          <div className="px-4 py-6 sm:px-0">
            <div className="flex justify-between items-center mb-8">
              <div>
                <h1 className="text-3xl font-bold text-gray-900">Property Management</h1>
                <p className="text-gray-600 mt-2">Manage rental properties and track occupancy</p>
              </div>
              <Link href="/admin/properties/create">
                <Button className="flex items-center space-x-2">
                  <Plus className="w-4 h-4" />
                  <span>Add New Property</span>
                </Button>
              </Link>
            </div>

            {/* Properties Grid */}
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 xl:grid-cols-3">
              {properties && properties.length > 0 ? (
                properties.map((property) => {
                  const tenantCount = property.tenants?.[0]?.count || 0
                  const isOccupied = tenantCount > 0
                  
                  return (
                    <Card key={property.id} className="hover:shadow-lg transition-shadow">
                      <CardHeader className="pb-4">
                        <div className="flex items-start justify-between">
                          <div className="flex items-center space-x-3">
                            <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
                              <Building className="w-6 h-6 text-green-600" />
                            </div>
                            <div className="flex-1">
                              <CardTitle className="text-lg">{property.address}</CardTitle>
                              {property.unit_number && (
                                <CardDescription>Unit {property.unit_number}</CardDescription>
                              )}
                            </div>
                          </div>
                          <Badge variant={isOccupied ? "default" : "secondary"}>
                            {isOccupied ? "Occupied" : "Vacant"}
                          </Badge>
                        </div>
                      </CardHeader>
                      
                      <CardContent className="space-y-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-2 text-sm text-gray-600">
                            <DollarSign className="w-4 h-4" />
                            <span>Monthly Rent</span>
                          </div>
                          <span className="text-lg font-bold text-green-600">
                            {formatCurrency(property.rent_amount)}
                          </span>
                        </div>

                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-2 text-sm text-gray-600">
                            <Users className="w-4 h-4" />
                            <span>Tenants</span>
                          </div>
                          <span className="text-sm font-medium">
                            {tenantCount} assigned
                          </span>
                        </div>

                        <div className="flex items-start space-x-2 text-sm text-gray-600">
                          <MapPin className="w-4 h-4 mt-0.5" />
                          <span>{property.address}</span>
                        </div>
                        
                        <div className="pt-2 border-t">
                          <div className="flex space-x-2">
                            <Link href={`/admin/properties/${property.id}`} className="flex-1">
                              <Button variant="outline" size="sm" className="w-full">
                                View Details
                              </Button>
                            </Link>
                            <Link href={`/admin/properties/${property.id}/edit`} className="flex-1">
                              <Button size="sm" className="w-full">
                                Edit
                              </Button>
                            </Link>
                          </div>
                          <p className="text-xs text-gray-500 mt-2 text-center">
                            Use "View Details" for delete options
                          </p>
                        </div>
                      </CardContent>
                    </Card>
                  )
                })
              ) : (
                <div className="col-span-full">
                  <Card className="text-center py-12">
                    <CardContent>
                      <Building className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                      <h3 className="text-lg font-medium text-gray-900 mb-2">No properties yet</h3>
                      <p className="text-gray-600 mb-6">
                        Add your first rental property to start managing tenants and payments.
                      </p>
                      <Link href="/admin/properties/create">
                        <Button>
                          <Plus className="w-4 h-4 mr-2" />
                          Add First Property
                        </Button>
                      </Link>
                    </CardContent>
                  </Card>
                </div>
              )}
            </div>
          </div>
        </main>
      </div>
    )
  } catch (error) {
    redirect('/auth/login')
  }
} 