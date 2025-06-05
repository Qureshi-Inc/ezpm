import { requireAdmin } from '@/lib/auth'
import { createServerSupabaseClient } from '@/lib/supabase'
import { redirect } from 'next/navigation'
import { Navigation } from '@/components/layout/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { CreatePropertyForm } from '@/components/forms/CreatePropertyForm'
import Link from 'next/link'
import { ArrowLeft, Building } from 'lucide-react'

export default async function CreatePropertyPage() {
  try {
    const session = await requireAdmin()

    return (
      <div className="min-h-screen bg-gray-50">
        <Navigation role="admin" userName="Admin" />
        
        <main className="max-w-2xl mx-auto py-6 sm:px-6 lg:px-8">
          <div className="px-4 py-6 sm:px-0">
            <div className="mb-6">
              <Link href="/admin/properties" className="flex items-center text-blue-600 hover:text-blue-700 mb-4">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Properties
              </Link>
              <h1 className="text-3xl font-bold text-gray-900">Add New Property</h1>
              <p className="text-gray-600 mt-2">Create a new rental property listing</p>
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <Building className="w-5 h-5" />
                  <span>Property Details</span>
                </CardTitle>
                <CardDescription>
                  Enter the property information below
                </CardDescription>
              </CardHeader>
              <CardContent>
                <CreatePropertyForm />
              </CardContent>
            </Card>

            <Card className="mt-6">
              <CardContent className="pt-6">
                <h3 className="font-medium text-gray-900 mb-2">Next Steps</h3>
                <div className="text-sm text-gray-600 space-y-1">
                  <p>• After creating the property, you can assign tenants to it</p>
                  <p>• Set up rent collection schedules</p>
                  <p>• Configure property-specific settings</p>
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