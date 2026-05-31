import { getCurrentTenant } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { Navigation } from '@/components/layout/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { DocumentsManager } from '@/components/documents/DocumentsManager'

export default async function TenantDocumentsPage() {
  const tenant = await getCurrentTenant()
  if (!tenant) redirect('/auth/start')

  return (
    <div className="min-h-screen bg-background">
      <Navigation role="tenant" userName={tenant.first_name} />

      <main className="max-w-3xl mx-auto py-8 sm:py-12 px-4 sm:px-6 lg:px-8">
        <div className="mb-8">
          <p className="text-sm font-medium text-primary mb-1">Documents</p>
          <h1 className="font-display text-3xl sm:text-4xl font-medium tracking-tight text-foreground">
            Your documents
          </h1>
          <p className="text-muted-foreground mt-2">
            Upload things like renters insurance or proof of income, and find anything your property
            manager has shared with you.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Shared folder</CardTitle>
            <CardDescription>Everything here is private between you and your property manager.</CardDescription>
          </CardHeader>
          <CardContent>
            <DocumentsManager mode="tenant" />
          </CardContent>
        </Card>
      </main>
    </div>
  )
}
