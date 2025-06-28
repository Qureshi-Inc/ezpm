import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'
import { requireAdmin } from '@/lib/auth'

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Verify admin authentication
    await requireAdmin()
    
    const { id } = await params
    const supabase = createServerSupabaseClient()

    // Get the property details
    const { data: property, error: propertyFetchError } = await supabase
      .from('properties')
      .select('address, unit_number')
      .eq('id', id)
      .single()

    if (propertyFetchError || !property) {
      return NextResponse.json(
        { error: 'Property not found' },
        { status: 404 }
      )
    }

    // Check if property has any payments
    const { data: payments, error: paymentsError } = await supabase
      .from('payments')
      .select('id')
      .eq('property_id', id)
      .limit(1)

    if (paymentsError) {
      console.error('Error checking payments:', paymentsError)
      return NextResponse.json(
        { error: 'Failed to check property payments' },
        { status: 500 }
      )
    }

    if (payments && payments.length > 0) {
      return NextResponse.json(
        { error: 'Cannot delete property with existing payment history. Please unassign all tenants first and archive the property.' },
        { status: 400 }
      )
    }

    // Get tenants assigned to this property
    const { data: assignedTenants, error: tenantsError } = await supabase
      .from('tenants')
      .select('id, first_name, last_name')
      .eq('property_id', id)

    if (tenantsError) {
      console.error('Error checking tenants:', tenantsError)
      return NextResponse.json(
        { error: 'Failed to check assigned tenants' },
        { status: 500 }
      )
    }

    // Unassign all tenants from this property
    if (assignedTenants && assignedTenants.length > 0) {
      const { error: unassignError } = await supabase
        .from('tenants')
        .update({ property_id: null })
        .eq('property_id', id)

      if (unassignError) {
        console.error('Error unassigning tenants:', unassignError)
        return NextResponse.json(
          { error: 'Failed to unassign tenants from property' },
          { status: 500 }
        )
      }
    }

    // Delete the property
    const { error: deletePropertyError } = await supabase
      .from('properties')
      .delete()
      .eq('id', id)

    if (deletePropertyError) {
      console.error('Delete property error:', deletePropertyError)
      return NextResponse.json(
        { error: 'Failed to delete property' },
        { status: 500 }
      )
    }

    const propertyName = property.unit_number 
      ? `${property.address} - Unit ${property.unit_number}`
      : property.address

    const message = assignedTenants && assignedTenants.length > 0
      ? `Property "${propertyName}" deleted successfully. ${assignedTenants.length} tenant(s) were unassigned.`
      : `Property "${propertyName}" deleted successfully.`

    return NextResponse.json({
      success: true,
      message,
      unassignedTenants: assignedTenants?.length || 0
    })

  } catch (error) {
    console.error('Delete property error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    console.log('Property update request received')
    const session = await requireAdmin()
    console.log('Admin session verified')
    const supabase = createServerSupabaseClient()
    const { id } = await params
    console.log('Property ID:', id)

    const data = await request.json()
    console.log('Received data:', data)

    // Validate required fields
    if (!data.address || !data.rent_amount) {
      console.log('Validation failed: missing address or rent_amount')
      return NextResponse.json(
        { error: 'Address and rent amount are required' },
        { status: 400 }
      )
    }

    console.log('Validation passed, updating property...')

    // Update the property
    const { data: property, error } = await supabase
      .from('properties')
      .update({
        address: data.address,
        unit_number: data.unit_number,
        rent_amount: data.rent_amount,
        bedrooms: data.bedrooms,
        bathrooms: data.bathrooms,
        description: data.description,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single()

    if (error) {
      console.error('Failed to update property:', error)
      return NextResponse.json(
        { error: 'Failed to update property' },
        { status: 500 }
      )
    }

    console.log('Property updated successfully:', property)
    return NextResponse.json({ property })
  } catch (error) {
    console.error('Property update error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
} 