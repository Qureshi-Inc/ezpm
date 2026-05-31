'use client'

/**
 * CreateTenantForm — admin pre-stages a tenant by email.
 *
 * No password field. Zitadel owns the password lifecycle. After this form
 * succeeds, the admin separately invites the email from the Zitadel admin
 * UI (auto-invite via Zitadel API is a follow-up TODO).
 *
 * When the tenant accepts the invite and logs in, lib/provision.ts links
 * tenants.user_id to the new users row by matching email.
 */

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import Link from 'next/link'

interface Property {
  id: string
  address: string
  unit_number: string | null
}

interface CreateTenantFormProps {
  properties: Property[] | null
}

export function CreateTenantForm({ properties }: CreateTenantFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [warning, setWarning] = useState('')
  const [propertyId, setPropertyId] = useState('none')
  const [paymentDueDay, setPaymentDueDay] = useState('1')
  const router = useRouter()

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setIsSubmitting(true)
    setError('')

    const formData = new FormData(e.currentTarget)
    const data = {
      firstName: formData.get('first_name') as string,
      lastName: formData.get('last_name') as string,
      email: formData.get('email') as string,
      phone: formData.get('phone') as string,
      propertyId: propertyId === 'none' ? null : propertyId,
      paymentDueDay: parseInt(paymentDueDay),
    }

    try {
      const response = await fetch('/api/admin/tenants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      const result = await response.json()
      if (!response.ok) {
        throw new Error(result.error || 'Failed to create tenant')
      }
      // If Zitadel auto-invite failed or is disabled, hold on the form
      // to show the warning so the admin knows to do a manual invite.
      if (result.zitadelStatus === 'manual_fallback' || result.zitadelStatus === 'disabled') {
        setWarning(result.zitadelMessage || 'Tenant created, but invite needs manual handling.')
        setIsSubmitting(false)
        return
      }
      router.push('/admin/tenants')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create tenant')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="p-3 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md">
          {error}
        </div>
      )}
      {warning && (
        <div className="p-3 text-sm text-warning bg-warning/10 border border-warning/20 rounded-md">
          <p className="font-medium mb-1">Tenant saved, manual step required:</p>
          <p>{warning}</p>
          <Link href="/admin/tenants" className="text-warning underline mt-2 inline-block">
            Continue to tenants list →
          </Link>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="first_name">First Name *</Label>
          <Input id="first_name" name="first_name" placeholder="John" required disabled={isSubmitting} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="last_name">Last Name *</Label>
          <Input id="last_name" name="last_name" placeholder="Doe" required disabled={isSubmitting} />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="email">Email Address *</Label>
        <Input id="email" name="email" type="email" placeholder="john.doe@example.com" required disabled={isSubmitting} />
        <p className="text-xs text-muted-foreground">
          This must match the email you invite in Zitadel — the tenant is linked on first login by email match.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="phone">Phone Number</Label>
        <Input id="phone" name="phone" type="tel" placeholder="(555) 123-4567" disabled={isSubmitting} />
      </div>

      <div className="space-y-2">
        <Label htmlFor="payment_due_day">Monthly Payment Due Date *</Label>
        <Select value={paymentDueDay} onValueChange={setPaymentDueDay} disabled={isSubmitting}>
          <SelectTrigger>
            <SelectValue placeholder="Select payment due day" />
          </SelectTrigger>
          <SelectContent>
            {Array.from({ length: 28 }, (_, i) => i + 1).map(day => (
              <SelectItem key={day} value={day.toString()}>
                {day === 1 ? '1st' : day === 2 ? '2nd' : day === 3 ? '3rd' : `${day}th`} of each month
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          Capped at the 28th to avoid skipping months (no Feb 30th). Drives the Stripe Subscription billing anchor.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="property_id">Assign to Property</Label>
        <Select value={propertyId} onValueChange={setPropertyId} disabled={isSubmitting}>
          <SelectTrigger>
            <SelectValue placeholder="Select a property (optional)" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">No property assignment</SelectItem>
            {properties?.map((property) => (
              <SelectItem key={property.id} value={property.id}>
                {property.address}
                {property.unit_number && ` - Unit ${property.unit_number}`}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="bg-accent border border-primary/20 rounded-lg p-3 text-sm text-accent-foreground">
        <p className="font-medium mb-1">What happens when you submit:</p>
        <ol className="list-decimal pl-4 space-y-1">
          <li>A tenant record is created and linked to this property.</li>
          <li>A Zitadel user is created with this email, and an invitation email is sent automatically.</li>
          <li>The tenant clicks the email link, sets their password through Zitadel, and lands on the rent portal automatically.</li>
        </ol>
        <p className="mt-2 text-xs text-primary">
          If Zitadel auto-invite is not configured (no service token), the form will show a fallback
          message and you can invite manually in the Zitadel admin UI.
        </p>
      </div>

      <div className="flex space-x-4 pt-4">
        <Button type="submit" className="flex-1" disabled={isSubmitting}>
          {isSubmitting ? 'Creating...' : 'Create Tenant'}
        </Button>
        <Link href="/admin/tenants" className="flex-1">
          <Button type="button" variant="outline" className="w-full" disabled={isSubmitting}>
            Cancel
          </Button>
        </Link>
      </div>
    </form>
  )
}
