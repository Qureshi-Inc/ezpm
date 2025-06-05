'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import Link from 'next/link'

export function CreatePropertyForm() {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setIsSubmitting(true)
    setError('')

    const formData = new FormData(e.currentTarget)
    
    const data = {
      address: formData.get('address') as string,
      unitNumber: formData.get('unit_number') as string,
      rentAmount: formData.get('rent_amount') as string,
    }

    try {
      const response = await fetch('/api/admin/properties', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Failed to create property')
      }

      // Success - redirect to properties list
      router.push('/admin/properties')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create property')
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

      <div className="space-y-2">
        <Label htmlFor="address">Property Address *</Label>
        <Input 
          id="address" 
          name="address"
          placeholder="123 Main Street, City, State 12345"
          required 
          disabled={isSubmitting}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="unit_number">Unit Number</Label>
          <Input 
            id="unit_number" 
            name="unit_number"
            placeholder="1A, 2B, etc."
            disabled={isSubmitting}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="rent_amount">Monthly Rent *</Label>
          <Input 
            id="rent_amount" 
            name="rent_amount"
            type="number"
            step="0.01"
            placeholder="1500.00"
            required 
            disabled={isSubmitting}
          />
        </div>
      </div>



      <div className="flex space-x-4 pt-4">
        <Button type="submit" className="flex-1" disabled={isSubmitting}>
          {isSubmitting ? 'Creating...' : 'Create Property'}
        </Button>
        <Link href="/admin/properties" className="flex-1">
          <Button type="button" variant="outline" className="w-full" disabled={isSubmitting}>
            Cancel
          </Button>
        </Link>
      </div>
    </form>
  )
} 