import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { createServerSupabaseClient } from '@/lib/supabase'
import { requireAdmin } from '@/lib/auth'
import { calculateNextDueDate, generatePaymentForTenant } from '@/utils/payment-generation'

// Password validation function
function validatePassword(password: string): { isValid: boolean; errors: string[] } {
  const errors: string[] = []
  
  if (password.length < 8) {
    errors.push('Password must be at least 8 characters long')
  }
  
  if (!/[A-Z]/.test(password)) {
    errors.push('Password must contain at least one uppercase letter')
  }
  
  if (!/[a-z]/.test(password)) {
    errors.push('Password must contain at least one lowercase letter')
  }
  
  if (!/\d/.test(password)) {
    errors.push('Password must contain at least one number')
  }
  
  return {
    isValid: errors.length === 0,
    errors
  }
}

export async function POST(request: NextRequest) {
  try {
    // Verify admin authentication
    await requireAdmin()
    
    const { email, password, firstName, lastName, phone, propertyId, paymentDueDay } = await request.json()

    if (!email || !password || !firstName || !lastName) {
      return NextResponse.json(
        { error: 'Email, password, first name, and last name are required' },
        { status: 400 }
      )
    }

    if (paymentDueDay && (paymentDueDay < 1 || paymentDueDay > 31)) {
      return NextResponse.json(
        { error: 'Payment due day must be between 1 and 31' },
        { status: 400 }
      )
    }

    // Validate password strength
    const passwordValidation = validatePassword(password)
    if (!passwordValidation.isValid) {
      return NextResponse.json(
        { error: 'Password does not meet requirements', details: passwordValidation.errors },
        { status: 400 }
      )
    }

    const supabase = createServerSupabaseClient()

    // Check if user already exists
    const { data: existingUser } = await supabase
      .from('users')
      .select('id')
      .eq('email', email)
      .single()

    if (existingUser) {
      return NextResponse.json(
        { error: 'A user with this email already exists' },
        { status: 400 }
      )
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10)

    // Create user
    const { data: newUser, error: userError } = await supabase
      .from('users')
      .insert({
        email,
        password_hash: passwordHash,
        role: 'tenant'
      })
      .select()
      .single()

    if (userError || !newUser) {
      console.error('User creation error:', userError)
      return NextResponse.json(
        { error: 'Failed to create user account' },
        { status: 500 }
      )
    }

    // Create tenant record
    const tenantData: any = {
      user_id: newUser.id,
      first_name: firstName,
      last_name: lastName,
      payment_due_day: paymentDueDay || 1,
    }

    if (phone) {
      tenantData.phone = phone
    }

    if (propertyId && propertyId !== 'none') {
      tenantData.property_id = propertyId
    }

    const { data: newTenant, error: tenantError } = await supabase
      .from('tenants')
      .insert(tenantData)
      .select()
      .single()

    if (tenantError) {
      console.error('Tenant creation error:', tenantError)
      // Rollback user creation
      await supabase.from('users').delete().eq('id', newUser.id)
      return NextResponse.json(
        { error: 'Failed to create tenant profile' },
        { status: 500 }
      )
    }

    // Automatically generate first payment if tenant is assigned to a property
    if (propertyId && propertyId !== 'none') {
      try {
        const dueDate = calculateNextDueDate(paymentDueDay || 1)
        await generatePaymentForTenant(newTenant.id, dueDate, supabase)
        console.log(`Generated first payment for tenant ${newTenant.id} due on ${dueDate.toISOString().split('T')[0]}`)
      } catch (paymentError) {
        console.error('Failed to generate first payment:', paymentError)
        // Don't fail tenant creation if payment generation fails
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Tenant created successfully',
      tenant: newTenant
    })

  } catch (error) {
    console.error('Create tenant error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
} 