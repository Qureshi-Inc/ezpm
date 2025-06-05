'use client'

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
  first_name: string
  last_name: string
  phone: string | null
  property_id: string | null
  payment_due_day: number
  user?: {
    email: string
  }
}

interface EditTenantFormProps {
  tenant: Tenant
  properties: Property[] | null
}

export function EditTenantForm({ tenant, properties }: EditTenantFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [propertyId, setPropertyId] = useState(tenant.property_id || 'none')
  const [paymentDueDay, setPaymentDueDay] = useState(tenant.payment_due_day?.toString() || '1')
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
      newPassword: formData.get('new_password') as string,
      propertyId: propertyId === 'none' ? null : propertyId,
      paymentDueDay: parseInt(paymentDueDay)
    }

    try {
      const response = await fetch(`/api/admin/tenants/${tenant.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Failed to update tenant')
      }

      // Success - redirect to tenant details
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

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="first_name">First Name *</Label>
          <Input 
            id="first_name" 
            name="first_name"
            defaultValue={tenant.first_name}
            required 
            disabled={isSubmitting}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="last_name">Last Name *</Label>
          <Input 
            id="last_name" 
            name="last_name"
            defaultValue={tenant.last_name}
            required 
            disabled={isSubmitting}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="email">Email Address *</Label>
        <Input 
          id="email" 
          name="email"
          type="email"
          defaultValue={tenant.user?.email}
          required 
          disabled={isSubmitting}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="phone">Phone Number</Label>
        <Input 
          id="phone" 
          name="phone"
          type="tel"
          defaultValue={tenant.phone || ''}
          disabled={isSubmitting}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="payment_due_day">Monthly Payment Due Date *</Label>
        <Select value={paymentDueDay} onValueChange={setPaymentDueDay} disabled={isSubmitting}>
          <SelectTrigger>
            <SelectValue placeholder="Select payment due day" />
          </SelectTrigger>
          <SelectContent>
            {Array.from({ length: 31 }, (_, i) => i + 1).map(day => (
              <SelectItem key={day} value={day.toString()}>
                {day === 1 ? '1st' : day === 2 ? '2nd' : day === 3 ? '3rd' : `${day}th`} of each month
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-gray-600">
          Select which day of the month rent payments are due
        </p>
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

      <div className="border-t pt-4">
        <div className="space-y-2">
          <Label htmlFor="new_password">New Password (Optional)</Label>
          <Input 
            id="new_password" 
            name="new_password"
            type="password"
            placeholder="Leave blank to keep current password"
            disabled={isSubmitting}
          />
          <p className="text-xs text-gray-500">
            Only fill this field if you want to reset the tenant's password
          </p>
        </div>
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