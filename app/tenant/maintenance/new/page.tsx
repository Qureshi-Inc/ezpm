import { getCurrentTenant } from '@/lib/auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Navigation } from '@/components/layout/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { MaintenanceRequestForm } from '@/components/forms/MaintenanceRequestForm'
import { ArrowLeft } from 'lucide-react'

export default async function NewMaintenanceRequestPage() {
  const tenant = await getCurrentTenant()
  if (!tenant) redirect('/auth/start')

  return (
    <div className="min-h-screen bg-background">
      <Navigation role="tenant" userName={tenant.first_name} />

      <main className="max-w-2xl mx-auto py-8 sm:py-12 px-4 sm:px-6 lg:px-8">
        <Link
          href="/tenant/maintenance"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-6"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to requests
        </Link>

        <Card>
          <CardHeader>
            <CardTitle>Report an issue</CardTitle>
            <CardDescription>
              Tell us what&rsquo;s wrong and add photos if you can — it helps us fix it faster.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <MaintenanceRequestForm />
          </CardContent>
        </Card>
      </main>
    </div>
  )
}
