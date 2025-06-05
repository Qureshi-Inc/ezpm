import { requireAdmin } from '@/lib/auth'
import { createServerSupabaseClient } from '@/lib/supabase'
import { redirect } from 'next/navigation'
import { Navigation } from '@/components/layout/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import Link from 'next/link'
import { Plus, User, Mail, Phone, Building } from 'lucide-react'

export default async function TenantsPage() {
  try {
    const session = await requireAdmin()
    const supabase = createServerSupabaseClient()

    // Get all tenants with their user info and property details
    const { data: tenants, error } = await supabase
      .from('tenants')
      .select(`
        *,
        user:users(email),
        property:properties(address, unit_number, rent_amount)
      `)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Error fetching tenants:', error)
    }

    return (
      <div className="min-h-screen bg-gray-50">
        <Navigation role="admin" userName="Admin" />
        
        <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
          <div className="px-4 py-6 sm:px-0">
            <div className="flex justify-between items-center mb-8">
              <div>
                <h1 className="text-3xl font-bold text-gray-900">Tenant Management</h1>
                <p className="text-gray-600 mt-2">Manage and oversee all tenant accounts</p>
              </div>
              <Link href="/admin/tenants/create">
                <Button className="flex items-center space-x-2">
                  <Plus className="w-4 h-4" />
                  <span>Add New Tenant</span>
                </Button>
              </Link>
            </div>

            {/* Tenants Grid */}
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 xl:grid-cols-3">
              {tenants && tenants.length > 0 ? (
                tenants.map((tenant) => (
                  <Card key={tenant.id} className="hover:shadow-lg transition-shadow">
                    <CardHeader className="pb-4">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center space-x-3">
                          <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
                            <User className="w-6 h-6 text-blue-600" />
                          </div>
                          <div>
                            <CardTitle className="text-lg">
                              {tenant.first_name} {tenant.last_name}
                            </CardTitle>
                            <CardDescription className="flex items-center space-x-1">
                              <Mail className="w-3 h-3" />
                              <span>{tenant.user?.email}</span>
                            </CardDescription>
                          </div>
                        </div>
                        <Badge variant={tenant.property_id ? "default" : "secondary"}>
                          {tenant.property_id ? "Assigned" : "Unassigned"}
                        </Badge>
                      </div>
                    </CardHeader>
                    
                    <CardContent className="space-y-3">
                      {tenant.phone && (
                        <div className="flex items-center space-x-2 text-sm text-gray-600">
                          <Phone className="w-4 h-4" />
                          <span>{tenant.phone}</span>
                        </div>
                      )}
                      
                      {tenant.property ? (
                        <div className="flex items-start space-x-2 text-sm">
                          <Building className="w-4 h-4 text-gray-400 mt-0.5" />
                          <div>
                            <p className="font-medium text-gray-900">{tenant.property.address}</p>
                            {tenant.property.unit_number && (
                              <p className="text-gray-600">Unit {tenant.property.unit_number}</p>
                            )}
                            <p className="text-blue-600 font-medium">
                              ${tenant.property.rent_amount}/month
                            </p>
                          </div>
                        </div>
                      ) : (
                        <div className="text-sm text-gray-500 italic">
                          No property assigned
                        </div>
                      )}
                      
                      <div className="pt-2 border-t">
                        <div className="flex space-x-2">
                          <Link href={`/admin/tenants/${tenant.id}`} className="flex-1">
                            <Button variant="outline" size="sm" className="w-full">
                              View Details
                            </Button>
                          </Link>
                          <Link href={`/admin/tenants/${tenant.id}/edit`} className="flex-1">
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
                ))
              ) : (
                <div className="col-span-full">
                  <Card className="text-center py-12">
                    <CardContent>
                      <User className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                      <h3 className="text-lg font-medium text-gray-900 mb-2">No tenants yet</h3>
                      <p className="text-gray-600 mb-6">
                        Get started by adding your first tenant to the system.
                      </p>
                      <Link href="/admin/tenants/create">
                        <Button>
                          <Plus className="w-4 h-4 mr-2" />
                          Add First Tenant
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