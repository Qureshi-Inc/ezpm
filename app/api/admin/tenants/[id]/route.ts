import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { createServerSupabaseClient } from '@/lib/supabase'
import { requireAdmin } from '@/lib/auth'
import { calculateNextDueDate, generatePaymentForTenant } from '@/utils/payment-generation'

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Verify admin authentication
    await requireAdmin()
    
    const { id } = await params
    const { email, firstName, lastName, phone, propertyId, newPassword, paymentDueDay } = await request.json()

    if (!email || !firstName || !lastName) {
      return NextResponse.json(
        { error: 'Email, first name, and last name are required' },
        { status: 400 }
      )
    }

    if (paymentDueDay && (paymentDueDay < 1 || paymentDueDay > 31)) {
      return NextResponse.json(
        { error: 'Payment due day must be between 1 and 31' },
        { status: 400 }
      )
    }

    const supabase = createServerSupabaseClient()

    // Get the tenant to find the user_id and current property assignment
    const { data: tenant, error: tenantFetchError } = await supabase
      .from('tenants')
      .select('user_id, property_id, payment_due_day')
      .eq('id', id)
      .single()

    if (tenantFetchError || !tenant) {
      return NextResponse.json(
        { error: 'Tenant not found' },
        { status: 404 }
      )
    }

    // Check if email is being changed and if it conflicts with another user
    const { data: existingUser } = await supabase
      .from('users')
      .select('id')
      .eq('email', email)
      .neq('id', tenant.user_id)
      .single()

    if (existingUser) {
      return NextResponse.json(
        { error: 'A user with this email already exists' },
        { status: 400 }
      )
    }

    // Update user record
    const userUpdateData: any = { email }
    
    if (newPassword && newPassword.trim()) {
      userUpdateData.password_hash = await bcrypt.hash(newPassword, 10)
    }

    const { error: userUpdateError } = await supabase
      .from('users')
      .update(userUpdateData)
      .eq('id', tenant.user_id)

    if (userUpdateError) {
      console.error('User update error:', userUpdateError)
      return NextResponse.json(
        { error: 'Failed to update user account' },
        { status: 500 }
      )
    }

    // Update tenant record
    const tenantUpdateData: any = {
      first_name: firstName,
      last_name: lastName,
    }

    if (phone !== undefined) {
      tenantUpdateData.phone = phone || null
    }

    if (propertyId !== undefined) {
      tenantUpdateData.property_id = (propertyId && propertyId !== 'none') ? propertyId : null
    }

    if (paymentDueDay !== undefined) {
      tenantUpdateData.payment_due_day = paymentDueDay
    }

    const { data: updatedTenant, error: tenantUpdateError } = await supabase
      .from('tenants')
      .update(tenantUpdateData)
      .eq('id', id)
      .select()
      .single()

    if (tenantUpdateError) {
      console.error('Tenant update error:', tenantUpdateError)
      return NextResponse.json(
        { error: 'Failed to update tenant profile' },
        { status: 500 }
      )
    }

    // Check if we need to generate a payment due to property assignment or payment due day change
    const wasAssignedToProperty = !tenant.property_id && propertyId && propertyId !== 'none'
    const paymentDayChanged = paymentDueDay !== undefined && paymentDueDay !== tenant.payment_due_day

    if (wasAssignedToProperty || (paymentDayChanged && updatedTenant.property_id)) {
      try {
        const finalPaymentDueDay = paymentDueDay !== undefined ? paymentDueDay : tenant.payment_due_day
        const dueDate = calculateNextDueDate(finalPaymentDueDay)
        await generatePaymentForTenant(updatedTenant.id, dueDate, supabase)
        console.log(`Generated payment for tenant ${updatedTenant.id} due on ${dueDate.toISOString().split('T')[0]}`)
      } catch (paymentError) {
        console.error('Failed to generate payment:', paymentError)
        // Don't fail tenant update if payment generation fails
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Tenant updated successfully',
      tenant: updatedTenant
    })

  } catch (error) {
    console.error('Update tenant error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Verify admin authentication
    await requireAdmin()
    
    const { id } = await params
    const { force } = await request.json().catch(() => ({ force: false }))
    const supabase = createServerSupabaseClient()

    // Get the tenant to find the user_id
    const { data: tenant, error: tenantFetchError } = await supabase
      .from('tenants')
      .select('user_id, first_name, last_name')
      .eq('id', id)
      .single()

    if (tenantFetchError || !tenant) {
      return NextResponse.json(
        { error: 'Tenant not found' },
        { status: 404 }
      )
    }

    // Check if tenant has any payments
    const { data: payments, error: paymentsError } = await supabase
      .from('payments')
      .select('id')
      .eq('tenant_id', id)
      .limit(1)

    if (paymentsError) {
      console.error('Error checking payments:', paymentsError)
      return NextResponse.json(
        { error: 'Failed to check tenant payments' },
        { status: 500 }
      )
    }

    if (payments && payments.length > 0 && !force) {
      return NextResponse.json(
        { 
          error: 'Cannot delete tenant with existing payment history. Please archive the tenant instead.',
          hasPayments: true,
          tenantId: id
        },
        { status: 400 }
      )
    }

    // If force delete, remove all associated data
    if (force && payments && payments.length > 0) {
      console.log(`Force deleting tenant ${tenant.first_name} ${tenant.last_name} and all associated data`)
      
      // Delete in reverse dependency order
      // 1. Delete auto_payments
      await supabase
        .from('auto_payments')
        .delete()
        .eq('tenant_id', id)
      
      // 2. Delete payment_methods
      await supabase
        .from('payment_methods')
        .delete()
        .eq('tenant_id', id)
      
      // 3. Delete payments
      await supabase
        .from('payments')
        .delete()
        .eq('tenant_id', id)
      
      console.log('Deleted all associated payment data')
    }

    // Delete tenant record first (this will cascade to related records due to foreign key constraints)
    const { error: deleteTenantError } = await supabase
      .from('tenants')
      .delete()
      .eq('id', id)

    if (deleteTenantError) {
      console.error('Delete tenant error:', deleteTenantError)
      return NextResponse.json(
        { error: 'Failed to delete tenant' },
        { status: 500 }
      )
    }

    // Delete the associated user account
    const { error: deleteUserError } = await supabase
      .from('users')
      .delete()
      .eq('id', tenant.user_id)

    if (deleteUserError) {
      console.error('Delete user error:', deleteUserError)
      // Log the error but don't fail the request since tenant is already deleted
      console.warn('Tenant deleted but failed to delete associated user account')
    }

    return NextResponse.json({
      success: true,
      message: `Tenant ${tenant.first_name} ${tenant.last_name} deleted successfully`
    })

  } catch (error) {
    console.error('Delete tenant error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
} 