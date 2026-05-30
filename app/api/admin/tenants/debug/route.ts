/**
 * GET /api/admin/tenants/debug — admin-only sanity dump of all tenants
 * with their property assignment, linked user (if any), and recent payments.
 *
 * Useful during the Zitadel migration to spot tenants who haven't yet
 * linked (user_id IS NULL) vs tenants with active Stripe Subscriptions.
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { createServerSupabaseClient } from '@/lib/supabase'

export async function GET(_request: NextRequest) {
  try {
    await requireAdmin()

    const supabase = createServerSupabaseClient()

    const { data: tenants, error: tenantsError } = await supabase
      .from('tenants')
      .select(`
        id,
        email,
        first_name,
        last_name,
        user_id,
        payment_due_day,
        stripe_customer_id,
        stripe_subscription_id,
        property_id,
        property:properties(id, address, rent_amount),
        user:users(email, zitadel_subject)
      `)

    if (tenantsError) {
      throw new Error(`Failed to fetch tenants: ${tenantsError.message}`)
    }

    const tenantsWithPayments = await Promise.all(
      (tenants || []).map(async (t) => {
        const { data: payments } = await supabase
          .from('payments')
          .select('id, due_date, status, amount, stripe_invoice_id')
          .eq('tenant_id', t.id)
          .order('due_date', { ascending: false })
          .limit(5)
        return { ...t, recentPayments: payments || [] }
      }),
    )

    return NextResponse.json({
      success: true,
      tenants: tenantsWithPayments,
      currentDate: new Date().toISOString().split('T')[0],
    })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (error instanceof Error && error.message === 'Forbidden') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    console.error('Debug tenants error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 },
    )
  }
}
