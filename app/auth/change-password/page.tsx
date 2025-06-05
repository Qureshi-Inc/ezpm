'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { PasswordChangeGuard } from '@/components/PasswordChangeGuard'
import { Shield, Lock, CheckCircle, AlertCircle } from 'lucide-react'

export default function ChangePasswordPage() {
  const router = useRouter()
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [validationErrors, setValidationErrors] = useState<string[]>([])
  const [loading, setLoading] = useState(false)

  // Real-time password validation
  const validatePasswordRealTime = (password: string) => {
    const errors: string[] = []
    
    if (password.length > 0 && password.length < 8) {
      errors.push('At least 8 characters long')
    }
    
    if (password.length > 0 && !/[A-Z]/.test(password)) {
      errors.push('One uppercase letter')
    }
    
    if (password.length > 0 && !/[a-z]/.test(password)) {
      errors.push('One lowercase letter')
    }
    
    if (password.length > 0 && !/\d/.test(password)) {
      errors.push('One number')
    }
    
    return errors
  }

  const getPasswordStrength = (password: string) => {
    const errors = validatePasswordRealTime(password)
    if (password.length === 0) return { strength: 0, label: '' }
    if (errors.length === 0) return { strength: 100, label: 'Strong' }
    if (errors.length <= 1) return { strength: 75, label: 'Good' }
    if (errors.length <= 2) return { strength: 50, label: 'Fair' }
    return { strength: 25, label: 'Weak' }
  }

  const handlePasswordChange = (password: string) => {
    setNewPassword(password)
    setValidationErrors(validatePasswordRealTime(password))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    // Client-side validation
    if (newPassword !== confirmPassword) {
      setError('New passwords do not match')
      setLoading(false)
      return
    }

    const finalValidation = validatePasswordRealTime(newPassword)
    if (finalValidation.length > 0) {
      setError('Please fix the password requirements')
      setLoading(false)
      return
    }

    try {
      const response = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          currentPassword, 
          newPassword 
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to change password')
      }

      // Success - redirect to appropriate dashboard
      // We'll need to get the user role to redirect properly
      const userRole = await getUserRole()
      if (userRole === 'admin') {
        router.push('/admin')
      } else {
        router.push('/tenant')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setLoading(false)
    }
  }

  // Helper function to get user role (you might want to implement this differently)
  const getUserRole = async () => {
    try {
      const response = await fetch('/api/auth/me')
      const data = await response.json()
      return data.role || 'tenant'
    } catch {
      return 'tenant'
    }
  }

  const passwordStrength = getPasswordStrength(newPassword)

  return (
    <PasswordChangeGuard>
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="relative z-10 w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-orange-500 rounded-full shadow-lg mb-4">
            <Shield className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900">Change Your Password</h1>
          <p className="text-gray-600 mt-2">Please update your temporary password</p>
        </div>

        <Card className="shadow-2xl border-0 bg-white/80 backdrop-blur-sm">
          <CardHeader className="space-y-1 text-center pb-6">
            <CardTitle className="text-2xl font-bold text-gray-900">Secure Your Account</CardTitle>
            <CardDescription className="text-gray-600">
              Choose a strong password to protect your account
            </CardDescription>
          </CardHeader>
          
          <form onSubmit={handleSubmit}>
            <CardContent className="space-y-6">
              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm flex items-center space-x-2">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span>{error}</span>
                </div>
              )}
              
              <div className="space-y-2">
                <Label htmlFor="currentPassword" className="text-gray-700 font-medium">
                  Current Password
                </Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                  <Input
                    id="currentPassword"
                    type="password"
                    placeholder="Enter your current password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    className="pl-11 h-12 border-gray-200 focus:border-blue-500 focus:ring-blue-500"
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="newPassword" className="text-gray-700 font-medium">
                  New Password
                </Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                  <Input
                    id="newPassword"
                    type="password"
                    placeholder="Enter your new password"
                    value={newPassword}
                    onChange={(e) => handlePasswordChange(e.target.value)}
                    className="pl-11 h-12 border-gray-200 focus:border-blue-500 focus:ring-blue-500"
                    required
                  />
                </div>
                
                {/* Password Strength Indicator */}
                {newPassword && (
                  <div className="space-y-2">
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-gray-600">Password strength:</span>
                      <span className={`font-medium ${
                        passwordStrength.strength >= 75 ? 'text-green-600' :
                        passwordStrength.strength >= 50 ? 'text-yellow-600' :
                        'text-red-600'
                      }`}>
                        {passwordStrength.label}
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div 
                        className={`h-2 rounded-full transition-all ${
                          passwordStrength.strength >= 75 ? 'bg-green-500' :
                          passwordStrength.strength >= 50 ? 'bg-yellow-500' :
                          'bg-red-500'
                        }`}
                        style={{ width: `${passwordStrength.strength}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirmPassword" className="text-gray-700 font-medium">
                  Confirm New Password
                </Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                  <Input
                    id="confirmPassword"
                    type="password"
                    placeholder="Confirm your new password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="pl-11 h-12 border-gray-200 focus:border-blue-500 focus:ring-blue-500"
                    required
                  />
                </div>
                {confirmPassword && newPassword !== confirmPassword && (
                  <p className="text-red-600 text-sm">Passwords do not match</p>
                )}
              </div>

              {/* Password Requirements */}
              <div className="bg-gray-50 rounded-lg p-4">
                <h4 className="text-sm font-medium text-gray-900 mb-2">Password Requirements:</h4>
                <div className="space-y-1">
                  {[
                    { rule: 'At least 8 characters long', met: newPassword.length >= 8 },
                    { rule: 'One uppercase letter', met: /[A-Z]/.test(newPassword) },
                    { rule: 'One lowercase letter', met: /[a-z]/.test(newPassword) },
                    { rule: 'One number', met: /\d/.test(newPassword) },
                  ].map((req, index) => (
                    <div key={index} className="flex items-center space-x-2 text-sm">
                      <CheckCircle className={`w-4 h-4 ${
                        req.met ? 'text-green-500' : 'text-gray-300'
                      }`} />
                      <span className={req.met ? 'text-green-700' : 'text-gray-600'}>
                        {req.rule}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <Button 
                type="submit" 
                className="w-full h-12 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-semibold shadow-lg hover:shadow-xl transition-all duration-200" 
                disabled={loading || validationErrors.length > 0 || newPassword !== confirmPassword}
              >
                {loading ? (
                  <div className="flex items-center space-x-2">
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    <span>Updating Password...</span>
                  </div>
                ) : (
                  'Update Password'
                )}
              </Button>
            </CardContent>
          </form>
        </Card>
      </div>
    </div>
    </PasswordChangeGuard>
  )
} 