import { requireAdmin } from '@/lib/auth'
import { createServerSupabaseClient } from '@/lib/supabase'
import { redirect } from 'next/navigation'
import { Navigation } from '@/components/layout/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import Link from 'next/link'
import { ArrowLeft, Building } from 'lucide-react'

export default async function EditPropertyPage({ params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAdmin()
    const supabase = createServerSupabaseClient()
    const { id } = await params

    // Get property details
    const { data: property, error } = await supabase
      .from('properties')
      .select('*')
      .eq('id', id)
      .single()

    if (error || !property) {
      redirect('/admin/properties')
    }

    return (
      <div className="min-h-screen bg-gray-50">
        <Navigation role="admin" userName="Admin" />

        <main className="max-w-2xl mx-auto py-6 sm:px-6 lg:px-8">
          <div className="px-4 py-6 sm:px-0">
            <div className="mb-6">
              <Link
                href={`/admin/properties/${property.id}`}
                className="flex items-center text-blue-600 hover:text-blue-700 mb-4"
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Property Details
              </Link>
              <h1 className="text-3xl font-bold text-gray-900">Edit Property</h1>
              <p className="text-gray-600 mt-2">Update property information</p>
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <Building className="w-5 h-5" />
                  <span>Property Details</span>
                </CardTitle>
                <CardDescription>
                  Update the property information below
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form className="space-y-6">
                  <div className="space-y-2">
                    <Label htmlFor="address">Property Address *</Label>
                    <Input
                      id="address"
                      name="address"
                      defaultValue={property.address}
                      required
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="unit_number">Unit Number</Label>
                      <Input
                        id="unit_number"
                        name="unit_number"
                        defaultValue={property.unit_number || ''}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="rent_amount">Monthly Rent *</Label>
                      <Input
                        id="rent_amount"
                        name="rent_amount"
                        type="number"
                        step="0.01"
                        defaultValue={property.rent_amount}
                        required
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="bedrooms">Bedrooms</Label>
                      <Input
                        id="bedrooms"
                        name="bedrooms"
                        type="number"
                        defaultValue={property.bedrooms || ''}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="bathrooms">Bathrooms</Label>
                      <Input
                        id="bathrooms"
                        name="bathrooms"
                        type="number"
                        step="0.5"
                        defaultValue={property.bathrooms || ''}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="description">Description</Label>
                    <textarea
                      id="description"
                      name="description"
                      className="min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                      defaultValue={property.description || ''}
                      placeholder="Optional description of the property..."
                    />
                  </div>

                  <div className="flex space-x-4 pt-4">
                    <Button type="submit" className="flex-1">
                      Update Property
                    </Button>
                    <Link href={`/admin/properties/${property.id}`} className="flex-1">
                      <Button type="button" variant="outline" className="w-full">
                        Cancel
                      </Button>
                    </Link>
                  </div>
                </form>
              </CardContent>
            </Card>

            <Card className="mt-6">
              <CardContent className="pt-6">
                <h3 className="font-medium text-gray-900 mb-2">Property Information</h3>
                <div className="text-sm text-gray-600 space-y-1">
                  <p>• Property ID: {property.id}</p>
                  <p>• Created: {new Date(property.created_at).toLocaleDateString()}</p>
                  <p>• Last Updated: {new Date(property.updated_at).toLocaleDateString()}</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </main>
      </div>
    )
  } catch (error) {
    redirect('/auth/login')
  }
}
