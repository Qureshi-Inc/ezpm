import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'
import { requireAdmin } from '@/lib/auth'

export async function POST(request: NextRequest) {
  try {
    // Verify admin authentication
    await requireAdmin()
    
    const { address, unitNumber, rentAmount } = await request.json()

    if (!address || !rentAmount) {
      return NextResponse.json(
        { error: 'Address and rent amount are required' },
        { status: 400 }
      )
    }

    const supabase = createServerSupabaseClient()

    // Create property record
    const propertyData: any = {
      address,
      rent_amount: parseFloat(rentAmount),
    }

    if (unitNumber) {
      propertyData.unit_number = unitNumber
    }

    const { data: newProperty, error: propertyError } = await supabase
      .from('properties')
      .insert(propertyData)
      .select()
      .single()

    if (propertyError) {
      console.error('Property creation error:', propertyError)
      return NextResponse.json(
        { error: 'Failed to create property' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      message: 'Property created successfully',
      property: newProperty
    })

  } catch (error) {
    console.error('Create property error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
} 