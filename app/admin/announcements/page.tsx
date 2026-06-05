import { requireAdmin } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { Navigation } from '@/components/layout/navigation'
import { AnnouncementsManager } from '@/components/admin/AnnouncementsManager'

export default async function AdminAnnouncementsPage() {
  try {
    await requireAdmin()
  } catch {
    redirect('/auth/start')
  }

  return (
    <div className="min-h-screen bg-background">
      <Navigation role="admin" userName="Admin" />

      <main className="max-w-3xl mx-auto py-8 sm:py-12 px-4 sm:px-6 lg:px-8">
        <div className="mb-8">
          <p className="text-sm font-medium text-primary mb-1">Announcements</p>
          <h1 className="font-display text-3xl sm:text-4xl font-medium tracking-tight text-foreground">
            Tell your tenants
          </h1>
          <p className="text-muted-foreground mt-2">
            Post a notice every tenant sees on their dashboard. Optionally email it too.
          </p>
        </div>

        <AnnouncementsManager />
      </main>
    </div>
  )
}
