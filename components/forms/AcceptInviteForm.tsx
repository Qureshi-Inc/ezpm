'use client'

/**
 * AcceptInviteForm — tenant lands here from the Zitadel-sent invite email.
 * They set a password; we POST to /api/auth/invite/complete which verifies
 * the code with Zitadel + sets the password. Then they click "Sign in" and
 * go through the normal OIDC flow with their new password.
 */

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { AlertCircle, Check, Eye, EyeOff } from 'lucide-react'

interface AcceptInviteFormProps {
  userId: string
  code: string
}

export function AcceptInviteForm({ userId, code }: AcceptInviteFormProps) {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [show, setShow] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }
    if (!/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password)) {
      setError('Password must include an uppercase letter, lowercase letter, and a number.')
      return
    }
    if (password !== confirm) {
      setError('Passwords do not match.')
      return
    }

    setIsSubmitting(true)
    try {
      const res = await fetch('/api/auth/invite/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, code, password }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Failed to complete invite')
        setIsSubmitting(false)
        return
      }
      setSuccess(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error')
      setIsSubmitting(false)
    }
  }

  if (success) {
    return (
      <div className="space-y-4 text-center">
        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
          <Check className="w-8 h-8 text-green-600" />
        </div>
        <h3 className="text-lg font-medium text-green-900">Password set</h3>
        <p className="text-sm text-gray-600">
          Click below to sign in with your new password. You&apos;ll be taken to your tenant dashboard.
        </p>
        <Button
          className="w-full"
          onClick={() => router.push('/api/auth/signin?callbackUrl=/tenant')}
        >
          Sign in
        </Button>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {error && (
        <div className="p-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg flex items-start space-x-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="password">New password</Label>
        <div className="relative">
          <Input
            id="password"
            type={show ? 'text' : 'password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={isSubmitting}
            required
            placeholder="At least 8 characters"
            autoFocus
          />
          <button
            type="button"
            onClick={() => setShow(!show)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            aria-label={show ? 'Hide password' : 'Show password'}
          >
            {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
        <p className="text-xs text-gray-500">
          Must include an uppercase letter, lowercase letter, and a number.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="confirm">Confirm password</Label>
        <Input
          id="confirm"
          type={show ? 'text' : 'password'}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          disabled={isSubmitting}
          required
          placeholder="Type it again"
        />
      </div>

      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? 'Setting password...' : 'Set Password'}
      </Button>
    </form>
  )
}
