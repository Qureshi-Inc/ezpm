'use client'

/**
 * EditTenantForm — update local tenant metadata. No password handling.
 *
 * Changing email here only updates the local mirror; Zitadel email must be
 * changed separately in the Zitadel admin UI to actually move the auth
 * identity. The API surface returns a `warning` when the email diverges.
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

interface Tenant {
  id: string
  email: string
  first_name: string
  last_name: string
  phone: string | null
  property_id: string | null
  payment_due_day: number
  user_id: string | null
}

interface EditTenantFormProps {
  tenant: Tenant
  properties: Property[] | null
}

export function EditTenantForm({ tenant, properties }: EditTenantFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [warning, setWarning] = useState('')
  const [propertyId, setPropertyId] = useState(tenant.property_id || 'none')
  const [paymentDueDay, setPaymentDueDay] = useState(tenant.payment_due_day?.toString() || '1')
  const router = useRouter()

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setIsSubmitting(true)
    setError('')
    setWarning('')

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
      const response = await fetch(`/api/admin/tenants/${tenant.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      const result = await response.json()
      if (!response.ok) {
        throw new Error(result.error || 'Failed to update tenant')
      }
      if (result.warning) {
        setWarning(result.warning)
        // Don't auto-navigate so admin can see the warning
        setIsSubmitting(false)
        return
      }
      router.push(`/admin/tenants/${tenant.id}`)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update tenant')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="p-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-md">
          {error}
        </div>
      )}
      {warning && (
        <div className="p-3 text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-md">
          <p className="font-medium">Heads up:</p>
          <p>{warning}</p>
          <Link href={`/admin/tenants/${tenant.id}`} className="text-amber-900 underline">
            Continue to tenant details →
          </Link>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="first_name">First Name *</Label>
          <Input id="first_name" name="first_name" defaultValue={tenant.first_name} required disabled={isSubmitting} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="last_name">Last Name *</Label>
          <Input id="last_name" name="last_name" defaultValue={tenant.last_name} required disabled={isSubmitting} />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="email">Email Address *</Label>
        <Input id="email" name="email" type="email" defaultValue={tenant.email} required disabled={isSubmitting} />
        {tenant.user_id && (
          <p className="text-xs text-amber-700">
            Tenant has already logged in via Zitadel. Changing email here only updates this app's mirror — change the
            Zitadel email separately if you want auth to move too.
          </p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="phone">Phone Number</Label>
        <Input id="phone" name="phone" type="tel" defaultValue={tenant.phone || ''} disabled={isSubmitting} />
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
      </div>

      <div className="space-y-2">
        <Label htmlFor="property_id">Assigned Property</Label>
        <Select value={propertyId} onValueChange={setPropertyId} disabled={isSubmitting}>
          <SelectTrigger>
            <SelectValue placeholder="Select a property" />
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

      <div className="flex space-x-4 pt-4">
        <Button type="submit" className="flex-1" disabled={isSubmitting}>
          {isSubmitting ? 'Updating...' : 'Update Tenant'}
        </Button>
        <Link href={`/admin/tenants/${tenant.id}`} className="flex-1">
          <Button type="button" variant="outline" className="w-full" disabled={isSubmitting}>
            Cancel
          </Button>
        </Link>
      </div>
    </form>
  )
}
