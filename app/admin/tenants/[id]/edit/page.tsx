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

    const { data: tenant, error: tenantError } = await supabase
      .from('tenants')
      .select('*')
      .eq('id', id)
      .single()

    if (tenantError || !tenant) {
      redirect('/admin/tenants')
    }

    // Email lives on tenants directly now (post-Zitadel migration). The form
    // doesn't need a separate user join.
    const tenantWithUser = tenant

    // Get all properties for the dropdown
    const { data: properties } = await supabase
      .from('properties')
      .select('*')
      .order('address', { ascending: true })

    return (
      <div className="min-h-screen bg-background">
        <Navigation role="admin" userName="Admin" />
        
        <main className="max-w-2xl mx-auto py-6 sm:px-6 lg:px-8">
          <div className="px-4 py-6 sm:px-0">
            <div className="mb-6">
              <Link href={`/admin/tenants/${id}`} className="flex items-center text-primary hover:text-primary mb-4">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Tenant Details
              </Link>
              <h1 className="font-display text-3xl font-medium tracking-tight text-foreground">Edit Tenant</h1>
              <p className="text-muted-foreground mt-2">Update tenant information</p>
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
                <h3 className="font-medium text-foreground mb-2">Account Information</h3>
                <div className="text-sm text-muted-foreground space-y-1">
                  <p>• Account ID: {tenantWithUser.id}</p>
                  <p>• Zitadel-linked user ID: {tenantWithUser.user_id ?? 'not yet (tenant has not logged in)'}</p>
                  <p>• Stripe Customer: {tenantWithUser.stripe_customer_id ?? 'not yet created'}</p>
                  <p>• Stripe Subscription: {tenantWithUser.stripe_subscription_id ?? 'no active subscription'}</p>
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
    redirect('/auth/start')
  }
} 