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
      <div className="min-h-screen bg-background">
        <Navigation role="admin" userName="Admin" />
        
        <main className="max-w-2xl mx-auto py-6 sm:px-6 lg:px-8">
          <div className="px-4 py-6 sm:px-0">
            <div className="mb-6">
              <Link href="/admin/tenants" className="flex items-center text-primary hover:text-primary mb-4">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Tenants
              </Link>
              <h1 className="font-display text-3xl font-medium tracking-tight text-foreground">Add New Tenant</h1>
              <p className="text-muted-foreground mt-2">Create a new tenant account</p>
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
                <h3 className="font-medium text-foreground mb-2">What happens next?</h3>
                <div className="text-sm text-muted-foreground space-y-1">
                  <p>• You invite the tenant&apos;s email in the Zitadel admin UI (Org → Users → New).</p>
                  <p>• Zitadel emails them an invite link to set their password.</p>
                  <p>• On first login here, the tenant is auto-linked to this record by email match.</p>
                  <p>• They add a payment method (card or ACH) and the Stripe Customer + Subscription are created.</p>
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