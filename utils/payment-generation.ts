import { createServerSupabaseClient } from '@/lib/supabase'

interface Tenant {
  id: string
  payment_due_day: number
  property?: {
    rent_amount: number
  }
}

export function calculateNextDueDate(paymentDueDay: number, fromDate?: Date): Date {
  const today = fromDate || new Date()
  const currentYear = today.getFullYear()
  const currentMonth = today.getMonth()
  const currentDay = today.getDate()

  let dueDate: Date

  if (currentDay <= paymentDueDay) {
    // Due date is this month
    dueDate = new Date(currentYear, currentMonth, paymentDueDay)
  } else {
    // Due date is next month
    dueDate = new Date(currentYear, currentMonth + 1, paymentDueDay)
  }

  // Handle edge case for months with fewer days
  // If the payment due day doesn't exist in the target month, use the last day
  const lastDayOfMonth = new Date(dueDate.getFullYear(), dueDate.getMonth() + 1, 0).getDate()
  if (paymentDueDay > lastDayOfMonth) {
    dueDate.setDate(lastDayOfMonth)
  }

  return dueDate
}

export async function generatePaymentForTenant(
  tenantId: string, 
  dueDate: Date,
  supabase: ReturnType<typeof createServerSupabaseClient>
) {
  // Get tenant with property info
  const { data: tenant, error: tenantError } = await supabase
    .from('tenants')
    .select(`
      id,
      payment_due_day,
      property_id,
      property:properties(rent_amount)
    `)
    .eq('id', tenantId)
    .single()

  if (tenantError || !tenant || !tenant.property || !tenant.property_id) {
    throw new Error(`Tenant not found or has no assigned property: ${tenantId}`)
  }

  const rentAmount = (tenant.property as any).rent_amount

  // Check if a payment already exists for this due date
  const dueDateStr = dueDate.toISOString().split('T')[0]
  const { data: existingPayment } = await supabase
    .from('payments')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('due_date', dueDateStr)
    .single()

  if (existingPayment) {
    return { message: 'Payment already exists for this due date', paymentId: existingPayment.id }
  }

  // Create the payment
  const { data: newPayment, error: paymentError } = await supabase
    .from('payments')
    .insert({
      tenant_id: tenantId,
      property_id: tenant.property_id,
      amount: rentAmount,
      due_date: dueDateStr,
      status: 'pending'
    })
    .select()
    .single()

  if (paymentError) {
    throw new Error(`Failed to create payment: ${paymentError.message}`)
  }

  return { message: 'Payment created successfully', payment: newPayment }
}

export async function generateUpcomingPayments(
  monthsAhead: number = 3,
  supabase: ReturnType<typeof createServerSupabaseClient>
) {
  // Get all active tenants with assigned properties
  const { data: tenants, error: tenantsError } = await supabase
    .from('tenants')
    .select(`
      id,
      payment_due_day,
      property:properties(rent_amount)
    `)
    .not('property_id', 'is', null)

  if (tenantsError || !tenants) {
    throw new Error(`Failed to fetch tenants: ${tenantsError?.message}`)
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
          dueDate: dueDate.toISOString().split('T')[0],
          ...result
        })
      } catch (error) {
        results.push({
          tenantId: tenant.id,
          dueDate: dueDate.toISOString().split('T')[0],
          error: error instanceof Error ? error.message : 'Unknown error'
        })
      }
    }
  }

  return results
}

export async function checkAndGenerateMissingPayments(
  supabase: ReturnType<typeof createServerSupabaseClient>
) {
  // Get all tenants with assigned properties
  const { data: tenants, error: tenantsError } = await supabase
    .from('tenants')
    .select(`
      id,
      first_name,
      last_name,
      payment_due_day,
      property:properties(rent_amount)
    `)
    .not('property_id', 'is', null)

  if (tenantsError || !tenants) {
    throw new Error(`Failed to fetch tenants: ${tenantsError?.message}`)
  }

  const results = []
  const today = new Date()
  
  for (const tenant of tenants) {
    if (!tenant.property) continue

    // Check if tenant should have a pending payment for current month
    const currentMonthDueDate = calculateNextDueDate(tenant.payment_due_day, today)
    
    // Only generate if the due date has passed or is today
    if (currentMonthDueDate <= today) {
      try {
        const result = await generatePaymentForTenant(tenant.id, currentMonthDueDate, supabase)
        
        if (result.payment) {
          results.push({
            tenantId: tenant.id,
            tenantName: `${tenant.first_name} ${tenant.last_name}`,
            dueDate: currentMonthDueDate.toISOString().split('T')[0],
            action: 'created',
            ...result
          })
        } else {
          results.push({
            tenantId: tenant.id,
            tenantName: `${tenant.first_name} ${tenant.last_name}`,
            dueDate: currentMonthDueDate.toISOString().split('T')[0],
            action: 'already_exists',
            ...result
          })
        }
      } catch (error) {
        results.push({
          tenantId: tenant.id,
          tenantName: `${tenant.first_name} ${tenant.last_name}`,
          dueDate: currentMonthDueDate.toISOString().split('T')[0],
          action: 'error',
          error: error instanceof Error ? error.message : 'Unknown error'
        })
      }
    }
  }

  return {
    checked: tenants.length,
    results,
    generated: results.filter(r => r.action === 'created').length,
    existing: results.filter(r => r.action === 'already_exists').length,
    errors: results.filter(r => r.action === 'error').length
  }
} 