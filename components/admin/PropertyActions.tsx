'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { DeleteConfirmationDialog } from '@/components/ui/delete-confirmation-dialog'
import { Edit, Trash2 } from 'lucide-react'

interface Property {
  id: string
  address: string
  unit_number?: string
}

interface PropertyActionsProps {
  property: Property
}

export function PropertyActions({ property }: PropertyActionsProps) {
  const router = useRouter()
  const [isDeleting, setIsDeleting] = useState(false)
  const [error, setError] = useState('')

  const handleDelete = async () => {
    setIsDeleting(true)
    setError('')

    try {
      const response = await fetch(`/api/admin/properties/${property.id}`, {
        method: 'DELETE',
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to delete property')
      }

      // Success - redirect to properties list
      router.push('/admin/properties')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete property')
      throw err // Re-throw to let the dialog handle the error state
    } finally {
      setIsDeleting(false)
    }
  }

  const propertyName = property.unit_number 
    ? `${property.address} - Unit ${property.unit_number}`
    : property.address

  return (
    <div className="space-y-4">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
          {error}
        </div>
      )}
      
      <div className="flex space-x-2">
        <Link href={`/admin/properties/${property.id}/edit`} className="flex-1">
          <Button className="w-full flex items-center justify-center space-x-2">
            <Edit className="w-4 h-4" />
            <span>Edit Property</span>
          </Button>
        </Link>
        
        <DeleteConfirmationDialog
          title="Delete Property"
          description="This action cannot be undone. This will permanently delete the property and unassign any tenants."
          itemName={propertyName}
          onConfirm={handleDelete}
          isLoading={isDeleting}
          destructiveWarning="Any tenants assigned to this property will be unassigned. If the property has payment history, deletion will be prevented."
          trigger={
            <Button
              variant="destructive"
              size="default"
              className="flex items-center space-x-2"
              disabled={isDeleting}
            >
              <Trash2 className="w-4 h-4" />
              <span>Delete</span>
            </Button>
          }
        />
      </div>
    </div>
  )
} 