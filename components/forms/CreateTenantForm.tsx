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

interface CreateTenantFormProps {
  properties: Property[] | null
}

export function CreateTenantForm({ properties }: CreateTenantFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')
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
      password: formData.get('password') as string,
      propertyId: propertyId === 'none' ? null : propertyId,
      paymentDueDay: parseInt(paymentDueDay)
    }

    try {
      const response = await fetch('/api/admin/tenants', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      })

      const result = await response.json()

      if (!response.ok) {
        if (result.details && Array.isArray(result.details)) {
          // Password validation errors
          throw new Error(`${result.error}: ${result.details.join(', ')}`)
        }
        throw new Error(result.error || 'Failed to create tenant')
      }

      // Success - redirect to tenants list
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
            placeholder="John"
            required 
            disabled={isSubmitting}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="last_name">Last Name *</Label>
          <Input 
            id="last_name" 
            name="last_name"
            placeholder="Doe"
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
          placeholder="john.doe@example.com"
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
          placeholder="(555) 123-4567"
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
          Select which day of the month rent payments are due (e.g., 1st for monthly payments due on the 1st)
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="password">Temporary Password *</Label>
        <Input 
          id="password" 
          name="password"
          type="password"
          placeholder="Create a secure temporary password"
          required 
          disabled={isSubmitting}
        />
        <div className="bg-blue-50 p-3 rounded-lg">
          <p className="text-xs text-blue-800 font-medium mb-1">Password Requirements:</p>
          <ul className="text-xs text-blue-700 space-y-0.5">
            <li>• At least 8 characters long</li>
            <li>• One uppercase letter (A-Z)</li>
            <li>• One lowercase letter (a-z)</li>
            <li>• One number (0-9)</li>
          </ul>
          <p className="text-xs text-blue-600 mt-2">
            The tenant will be prompted to change this password on first login.
          </p>
        </div>
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