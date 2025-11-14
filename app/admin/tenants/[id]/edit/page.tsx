import { requireAdmin } from '@/lib/auth'
import { createServerSupabaseClient } from '@/lib/supabase'
import { redirect } from 'next/navigation'
import { Navigation } from '@/components/layout/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { EditTenantForm } from '@/components/forms/EditTenantForm'
import Link from 'next/link'
import { ArrowLeft, User } from 'lucide-react'

interface EditTenantPageProps {
  params: Promise<{
    id: string
  }>
}

export default async function EditTenantPage({ params }: EditTenantPageProps) {
  try {
    const session = await requireAdmin()
    const supabase = createServerSupabaseClient()
    
    // Await params to fix Next.js 15 compatibility
    const { id } = await params

    // Get tenant details (using manual join to avoid foreign key dependency)
    const { data: tenant, error: tenantError } = await supabase
      .from('tenants')
      .select('*')
      .eq('id', id)
      .single()

    if (tenantError || !tenant) {
      redirect('/admin/tenants')
    }

    // Get user email separately
    const { data: user } = await supabase
      .from('users')
      .select('email')
      .eq('id', tenant.user_id)
      .single()

    // Merge data for form compatibility
    const tenantWithUser = {
      ...tenant,
      user: user || { email: '' }
    }

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
              <Link href={`/admin/tenants/${id}`} className="flex items-center text-blue-600 hover:text-blue-700 mb-4">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Tenant Details
              </Link>
              <h1 className="text-3xl font-bold text-gray-900">Edit Tenant</h1>
              <p className="text-gray-600 mt-2">Update tenant information</p>
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <User className="w-5 h-5" />
                  <span>Tenant Information</span>
                </CardTitle>
                <CardDescription>
                  Update the tenant's personal and contact information
                </CardDescription>
              </CardHeader>
              <CardContent>
                <EditTenantForm tenant={tenantWithUser} properties={properties} />
              </CardContent>
            </Card>

            <Card className="mt-6">
              <CardContent className="pt-6">
                <h3 className="font-medium text-gray-900 mb-2">Account Information</h3>
                <div className="text-sm text-gray-600 space-y-1">
                  <p>• Account ID: {tenantWithUser.id}</p>
                  <p>• User ID: {tenantWithUser.user_id}</p>
                  <p>• Created: {new Date(tenantWithUser.created_at).toLocaleDateString()}</p>
                  <p>• Last Updated: {new Date(tenantWithUser.updated_at).toLocaleDateString()}</p>
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