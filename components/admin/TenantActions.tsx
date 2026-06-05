'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { DeleteConfirmationDialog } from '@/components/ui/delete-confirmation-dialog'
import { Edit, Trash2, KeyRound } from 'lucide-react'

interface Tenant {
  id: string
  first_name: string
  last_name: string
  user?: {
    email: string
  }
}

interface TenantActionsProps {
  tenant: Tenant
}

export function TenantActions({ tenant }: TenantActionsProps) {
  const router = useRouter()
  const [isDeleting, setIsDeleting] = useState(false)
  const [isResetting, setIsResetting] = useState(false)
  const [error, setError] = useState('')
  const [successMessage, setSuccessMessage] = useState('')

  const handleDelete = async () => {
    setIsDeleting(true)
    setError('')

    try {
      const response = await fetch(`/api/admin/tenants/${tenant.id}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ force: false }),
      })

      const data = await response.json()

      if (!response.ok) {
        // If tenant has payment history, offer force delete option
        if (data.hasPayments) {
          const confirmForceDelete = window.confirm(
            `This tenant has payment history. This prevents normal deletion to protect data integrity.\n\n` +
            `For testing purposes, would you like to FORCE DELETE this tenant and ALL associated data?\n\n` +
            `⚠️ WARNING: This will permanently delete:\n` +
            `• All payment records\n` +
            `• All payment methods\n` +
            `• All auto-payment settings\n` +
            `• The tenant account\n` +
            `• The user account\n\n` +
            `This action CANNOT be undone!`
          )

          if (confirmForceDelete) {
            // Perform force delete
            const forceResponse = await fetch(`/api/admin/tenants/${tenant.id}`, {
              method: 'DELETE',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ force: true }),
            })

            const forceData = await forceResponse.json()

            if (!forceResponse.ok) {
              throw new Error(forceData.error || 'Failed to force delete tenant')
            }

            // Success - redirect to tenants list
            router.push('/admin/tenants')
            router.refresh()
            return
          } else {
            setError('Deletion cancelled. Consider archiving this tenant instead.')
            return
          }
        }

        throw new Error(data.error || 'Failed to delete tenant')
      }

      // Success - redirect to tenants list
      router.push('/admin/tenants')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete tenant')
      throw err // Re-throw to let the dialog handle the error state
    } finally {
      setIsDeleting(false)
    }
  }

  const handlePasswordReset = async () => {
    setIsResetting(true)
    setError('')
    setSuccessMessage('')
    try {
      const response = await fetch(`/api/admin/tenants/${tenant.id}/password-reset`, {
        method: 'POST',
      })
      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.error || 'Failed to send password reset')
      }
      setSuccessMessage(data.message || 'Password-reset link sent.')
      setTimeout(() => setSuccessMessage(''), 6000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send password reset')
    } finally {
      setIsResetting(false)
    }
  }

  const tenantName = `${tenant.first_name} ${tenant.last_name}`

  return (
    <div className="space-y-3">
      {error && (
        <div className="bg-destructive/10 border border-destructive/20 text-destructive px-4 py-3 rounded-lg text-sm">
          {error}
        </div>
      )}

      {successMessage && (
        <div className="bg-success/10 border border-success/30 text-success px-4 py-3 rounded-lg text-sm">
          {successMessage}
        </div>
      )}

      <div className="flex gap-2">
        <Link href={`/admin/tenants/${tenant.id}/edit`} className="flex-1 min-w-0">
          <Button className="w-full flex items-center justify-center gap-2">
            <Edit className="w-4 h-4" />
            <span>Edit</span>
          </Button>
        </Link>

        <DeleteConfirmationDialog
          title="Delete Tenant"
          description="This action cannot be undone. This will permanently delete the tenant account and remove all associated data."
          itemName={tenantName}
          onConfirm={handleDelete}
          isLoading={isDeleting}
          destructiveWarning="This will also delete the user's login account and cannot be reversed. If the tenant has payment history, deletion will be prevented."
          trigger={
            <Button
              variant="destructive"
              size="default"
              className="flex items-center justify-center gap-2 flex-shrink-0"
              disabled={isDeleting}
            >
              <Trash2 className="w-4 h-4" />
              <span>Delete</span>
            </Button>
          }
        />
      </div>

      <div className="pt-3 border-t">
        <Button
          variant="outline"
          size="sm"
          onClick={handlePasswordReset}
          disabled={isResetting}
          className="w-full flex items-center justify-center gap-2"
        >
          {isResetting ? (
            <>
              <div className="w-4 h-4 border-2 border-border border-t-transparent rounded-full animate-spin" />
              <span>Sending…</span>
            </>
          ) : (
            <>
              <KeyRound className="w-4 h-4" />
              <span>Send Password Reset</span>
            </>
          )}
        </Button>
        <p className="text-xs text-muted-foreground mt-1 text-center">
          Emails the tenant a secure Zitadel link to set a new password.
        </p>
      </div>
    </div>
  )
}
