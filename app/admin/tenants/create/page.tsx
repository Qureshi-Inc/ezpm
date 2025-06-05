import { requireAdmin } from '@/lib/auth'
import { createServerSupabaseClient } from '@/lib/supabase'
import { redirect } from 'next/navigation'
import { Navigation } from '@/components/layout/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { CreateTenantForm } from '@/components/forms/CreateTenantForm'
import Link from 'next/link'
import { ArrowLeft, User } from 'lucide-react'

export default async function CreateTenantPage() {
  try {
    const session = await requireAdmin()
    const supabase = createServerSupabaseClient()

    // Get all properties for the dropdown
    const { data: properties } = await supabase
      .from('properties')
      .select('*')
      .order('address', { ascending: true })

    return (
      <div className="min-h-screen bg-gray-50">
        <Navigation role="admin" userName="Admin" />
        
        <main className="max-w-2xl mx-auto py-6 sm:px-6 lg:px-8">
          <div className="px-4 py-6 sm:px-0">
            <div className="mb-6">
              <Link href="/admin/tenants" className="flex items-center text-blue-600 hover:text-blue-700 mb-4">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Tenants
              </Link>
              <h1 className="text-3xl font-bold text-gray-900">Add New Tenant</h1>
              <p className="text-gray-600 mt-2">Create a new tenant account</p>
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <User className="w-5 h-5" />
                  <span>Tenant Information</span>
                </CardTitle>
                <CardDescription>
                  Enter the tenant's personal and contact information
                </CardDescription>
              </CardHeader>
              <CardContent>
                <CreateTenantForm properties={properties} />
              </CardContent>
            </Card>

            <Card className="mt-6">
              <CardContent className="pt-6">
                <h3 className="font-medium text-gray-900 mb-2">What happens next?</h3>
                <div className="text-sm text-gray-600 space-y-1">
                  <p>• The tenant will receive login credentials via email</p>
                  <p>• They can access their tenant portal to view rent info</p>
                  <p>• You can assign them to properties and set up payments</p>
                  <p>• Payment methods can be added once they log in</p>
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