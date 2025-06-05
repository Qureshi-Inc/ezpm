import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { createServerSupabaseClient } from '@/lib/supabase'
import { calculateNextDueDate, generatePaymentForTenant } from '@/utils/payment-generation'

export async function POST(request: NextRequest) {
  try {
    await requireAdmin()
    
    const { tenantId, monthsAhead = 1 } = await request.json()
    const supabase = createServerSupabaseClient()

    if (tenantId) {
      // Generate payment for specific tenant
      const { data: tenant, error: tenantError } = await supabase
        .from('tenants')
        .select(`
          id,
          payment_due_day,
          first_name,
          last_name,
          property:properties(rent_amount)
        `)
        .eq('id', tenantId)
        .single()

      if (tenantError || !tenant) {
        return NextResponse.json(
          { error: 'Tenant not found' },
          { status: 404 }
        )
      }

      if (!tenant.property) {
        return NextResponse.json(
          { error: 'Tenant has no assigned property' },
          { status: 400 }
        )
      }

      const results = []
      
      // Generate payments for current month and upcoming months
      for (let i = 0; i < monthsAhead; i++) {
        const baseDate = new Date()
        baseDate.setMonth(baseDate.getMonth() + i)
        
        const dueDate = calculateNextDueDate(tenant.payment_due_day, baseDate)
        
        try {
          const result = await generatePaymentForTenant(tenant.id, dueDate, supabase)
          results.push({
            tenantId: tenant.id,
            tenantName: `${tenant.first_name} ${tenant.last_name}`,
            dueDate: dueDate.toISOString().split('T')[0],
            ...result
          })
        } catch (error) {
          results.push({
            tenantId: tenant.id,
            tenantName: `${tenant.first_name} ${tenant.last_name}`,
            dueDate: dueDate.toISOString().split('T')[0],
            error: error instanceof Error ? error.message : 'Unknown error'
          })
        }
      }

      return NextResponse.json({
        success: true,
        message: `Generated ${results.length} payment(s) for ${tenant.first_name} ${tenant.last_name}`,
        results
      })

    } else {
      // Generate payments for all tenants
      const { data: tenants, error: tenantsError } = await supabase
        .from('tenants')
        .select(`
          id,
          payment_due_day,
          first_name,
          last_name,
          property:properties(rent_amount)
        `)
        .not('property_id', 'is', null)

      if (tenantsError || !tenants) {
        return NextResponse.json(
          { error: 'Failed to fetch tenants' },
          { status: 500 }
        )
      }

      const results = []
      
      for (const tenant of tenants) {
        if (!tenant.property) continue

        // Generate payments for the next N months
        for (let i = 0; i < monthsAhead; i++) {
          const baseDate = new Date()
          baseDate.setMonth(baseDate.getMonth() + i)
          
          const dueDate = calculateNextDueDate(tenant.payment_due_day, baseDate)
          
          try {
            const result = await generatePaymentForTenant(tenant.id, dueDate, supabase)
            results.push({
              tenantId: tenant.id,
              tenantName: `${tenant.first_name} ${tenant.last_name}`,
              dueDate: dueDate.toISOString().split('T')[0],
              ...result
            })
          } catch (error) {
            results.push({
              tenantId: tenant.id,
              tenantName: `${tenant.first_name} ${tenant.last_name}`,
              dueDate: dueDate.toISOString().split('T')[0],
              error: error instanceof Error ? error.message : 'Unknown error'
            })
          }
        }
      }

      return NextResponse.json({
        success: true,
        message: `Generated payments for ${tenants.length} tenants`,
        results
      })
    }

  } catch (error) {
    console.error('Generate payments error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
} 