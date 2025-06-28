'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import Link from 'next/link'
import { ArrowLeft, Building, AlertCircle } from 'lucide-react'

interface Property {
  id: string
  address: string
  unit_number?: string
  rent_amount: number
  bedrooms?: number
  bathrooms?: number
  description?: string
  created_at: string
  updated_at: string
}

interface EditPropertyFormProps {
  property: Property
}

export default function EditPropertyForm({ property }: EditPropertyFormProps) {
  const router = useRouter()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setIsSubmitting(true)
    setError('')

    const formData = new FormData(e.currentTarget)
    
    // Helper function to parse number or return null if empty
    const parseNumber = (value: string | null): number | null => {
      if (!value || value.trim() === '') return null
      const parsed = parseFloat(value)
      return isNaN(parsed) ? null : parsed
    }

    // Helper function to parse integer or return null if empty
    const parseInteger = (value: string | null): number | null => {
      if (!value || value.trim() === '') return null
      const parsed = Number(value)
      return isNaN(parsed) ? null : parsed
    }
    
    const data = {
      address: (formData.get('address') as string)?.trim() || '',
      unit_number: (formData.get('unit_number') as string)?.trim() || null,
      rent_amount: parseFloat((formData.get('rent_amount') as string) || '0'),
      bedrooms: parseInteger(formData.get('bedrooms') as string),
      bathrooms: parseNumber(formData.get('bathrooms') as string),
      description: (formData.get('description') as string)?.trim() || null,
    }

    console.log('Form data being sent:', data)
    console.log('Property ID:', property.id)

    try {
      const response = await fetch(`/api/admin/properties/${property.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      })

      console.log('Response status:', response.status)
      const result = await response.json()
      console.log('Response result:', result)

      if (!response.ok) {
        throw new Error(result.error || 'Failed to update property')
      }

      // Success - redirect to property details
      router.push(`/admin/properties/${property.id}?message=property_updated`)
      router.refresh()
    } catch (err) {
      console.error('Form submission error:', err)
      setError(err instanceof Error ? err.message : 'Failed to update property')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="max-w-2xl mx-auto py-6 sm:px-6 lg:px-8">
      <div className="px-4 py-6 sm:px-0">
        <div className="mb-6">
          <Link
            href={`/admin/properties/${property.id}`}
            className="flex items-center text-blue-600 hover:text-blue-700 mb-4"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Property Details
          </Link>
          <h1 className="text-3xl font-bold text-gray-900">Edit Property</h1>
          <p className="text-gray-600 mt-2">Update property information</p>
        </div>

        {error && (
          <div className="mb-4 p-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Building className="w-5 h-5" />
              <span>Property Details</span>
            </CardTitle>
            <CardDescription>
              Update the property information below
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="address">Property Address *</Label>
                <Input
                  id="address"
                  name="address"
                  defaultValue={property.address}
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
                    defaultValue={property.unit_number || ''}
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
                    defaultValue={property.rent_amount}
                    required
                    disabled={isSubmitting}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="bedrooms">Bedrooms</Label>
                  <Input
                    id="bedrooms"
                    name="bedrooms"
                    type="number"
                    defaultValue={property.bedrooms || ''}
                    disabled={isSubmitting}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="bathrooms">Bathrooms</Label>
                  <Input
                    id="bathrooms"
                    name="bathrooms"
                    type="number"
                    step="0.5"
                    defaultValue={property.bathrooms || ''}
                    disabled={isSubmitting}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <textarea
                  id="description"
                  name="description"
                  className="min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  defaultValue={property.description || ''}
                  placeholder="Optional description of the property..."
                  disabled={isSubmitting}
                />
              </div>

              <div className="flex space-x-4 pt-4">
                <Button type="submit" className="flex-1" disabled={isSubmitting}>
                  {isSubmitting ? (
                    <div className="flex items-center space-x-2">
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>Updating...</span>
                    </div>
                  ) : (
                    'Update Property'
                  )}
                </Button>
                <Link href={`/admin/properties/${property.id}`} className="flex-1">
                  <Button type="button" variant="outline" className="w-full" disabled={isSubmitting}>
                    Cancel
                  </Button>
                </Link>
              </div>
            </form>
          </CardContent>
        </Card>

        <Card className="mt-6">
          <CardContent className="pt-6">
            <h3 className="font-medium text-gray-900 mb-2">Property Information</h3>
            <div className="text-sm text-gray-600 space-y-1">
              <p>• Property ID: {property.id}</p>
              <p>• Created: {new Date(property.created_at).toLocaleDateString()}</p>
              <p>• Last Updated: {new Date(property.updated_at).toLocaleDateString()}</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  )
} 