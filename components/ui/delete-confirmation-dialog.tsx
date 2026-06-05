'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { AlertTriangle, Trash2, X } from 'lucide-react'

interface DeleteConfirmationDialogProps {
  title: string
  description: string
  itemName: string
  onConfirm: () => Promise<void>
  isLoading?: boolean
  trigger?: React.ReactNode
  destructiveWarning?: string
}

export function DeleteConfirmationDialog({
  title,
  description,
  itemName,
  onConfirm,
  isLoading = false,
  trigger,
  destructiveWarning
}: DeleteConfirmationDialogProps) {
  const [open, setOpen] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  const handleConfirm = async () => {
    setIsDeleting(true)
    try {
      await onConfirm()
      setOpen(false)
    } catch (error) {
      // Error handling will be done in the parent component
    } finally {
      setIsDeleting(false)
    }
  }

  const defaultTrigger = (
    <Button
      variant="destructive"
      size="sm"
      className="flex items-center space-x-2"
      disabled={isLoading}
      onClick={() => setOpen(true)}
    >
      <Trash2 className="w-4 h-4" />
      <span>Delete</span>
    </Button>
  )

  if (!open) {
    return trigger ? (
      <div onClick={() => setOpen(true)}>{trigger}</div>
    ) : (
      defaultTrigger
    )
  }

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
        <Card className="w-full max-w-md bg-white shadow-2xl">
          <CardHeader className="relative">
            <button
              onClick={() => setOpen(false)}
              disabled={isDeleting}
              className="absolute right-4 top-4 p-1 hover:bg-muted rounded-full transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
            <CardTitle className="flex items-center space-x-2 text-destructive pr-8">
              <AlertTriangle className="w-5 h-5" />
              <span>{title}</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <p className="text-foreground">{description}</p>
              <p className="font-medium text-foreground">
                Item to delete: <span className="text-destructive">{itemName}</span>
              </p>
              {destructiveWarning && (
                <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3 mt-3">
                  <div className="flex items-start space-x-2">
                    <AlertTriangle className="w-4 h-4 text-destructive mt-0.5 flex-shrink-0" />
                    <p className="text-destructive text-sm font-medium">
                      {destructiveWarning}
                    </p>
                  </div>
                </div>
              )}
            </div>

            <div className="flex space-x-2 pt-4">
              <Button
                variant="outline"
                onClick={() => setOpen(false)}
                disabled={isDeleting}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={handleConfirm}
                disabled={isDeleting}
                className="flex-1 flex items-center justify-center space-x-2"
              >
                {isDeleting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Deleting...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4" />
                    <span>Delete Forever</span>
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  )
} 