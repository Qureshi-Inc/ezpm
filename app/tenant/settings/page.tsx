import { getCurrentTenant } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { Navigation } from '@/components/layout/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { NotificationSettings } from '@/components/tenant/NotificationSettings'

export default async function TenantSettingsPage() {
  const tenant = await getCurrentTenant()
  if (!tenant) redirect('/auth/start')

  return (
    <div className="min-h-screen bg-background">
      <Navigation role="tenant" userName={tenant.first_name} />

      <main className="max-w-2xl mx-auto py-8 sm:py-12 px-4 sm:px-6 lg:px-8">
        <div className="mb-8">
          <p className="text-sm font-medium text-primary mb-1">Settings</p>
          <h1 className="font-display text-3xl sm:text-4xl font-medium tracking-tight text-foreground">
            Notifications
          </h1>
          <p className="text-muted-foreground mt-2">Choose which emails and texts you&rsquo;d like to receive.</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Notifications</CardTitle>
            <CardDescription>Turn off anything you don&rsquo;t want, and opt in to text alerts.</CardDescription>
          </CardHeader>
          <CardContent>
            <NotificationSettings
              initialMaintenanceReplies={tenant.notify_maintenance_replies !== false}
              initialMaintenanceStatus={tenant.notify_maintenance_status !== false}
              initialPaymentCharged={tenant.notify_payment_charged !== false}
              initialSms={tenant.notify_sms === true}
              phone={tenant.phone ?? null}
            />
          </CardContent>
        </Card>
      </main>
    </div>
  )
}
