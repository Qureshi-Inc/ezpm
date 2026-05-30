/**
 * POST /api/admin/tenants/force-delete — nuclear "wipe everything" for a tenant.
 *
 * Used when normal DELETE refuses (payment history present). Requires the
 * confirmation phrase 'DELETE_ALL_DATA' in the body.
 *
 * Order matters: payments + payment_methods first (FK dependencies), then
 * tenant, then user. Zitadel user must be deleted separately via Zitadel
 * admin UI (T15-ish follow-up to wire up the Zitadel management API).
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { createServerSupabaseClient } from '@/lib/supabase'

export async function POST(request: NextRequest) {
  try {
    await requireAdmin()

    const { tenantId, confirmPhrase } = await request.json()
    if (confirmPhrase !== 'DELETE_ALL_DATA') {
      return NextResponse.json(
        { error: 'Invalid confirmation phrase. Use "DELETE_ALL_DATA" to confirm.' },
        { status: 400 },
      )
    }
    if (!tenantId) {
      return NextResponse.json({ error: 'Tenant ID is required' }, { status: 400 })
    }

    const supabase = createServerSupabaseClient()

    const { data: tenant, error: tenantError } = await supabase
      .from('tenants')
      .select('user_id, first_name, last_name, stripe_subscription_id')
      .eq('id', tenantId)
      .maybeSingle()
    if (tenantError || !tenant) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })
    }

    const steps: string[] = []

    // 1. payment_methods (referenced by payments via FK SET NULL but
    //    we delete them anyway to free Stripe-side resources later)
    {
      const { error } = await supabase.from('payment_methods').delete().eq('tenant_id', tenantId)
      steps.push(error ? `payment_methods failed: ${error.message}` : 'payment_methods deleted')
    }

    // 2. payments
    {
      const { error } = await supabase.from('payments').delete().eq('tenant_id', tenantId)
      steps.push(error ? `payments failed: ${error.message}` : 'payments deleted')
    }

    // 3. tenants
    {
      const { error } = await supabase.from('tenants').delete().eq('id', tenantId)
      steps.push(error ? `tenant failed: ${error.message}` : 'tenant deleted')
    }

    // 4. users (only if linked)
    if (tenant.user_id) {
      const { error } = await supabase.from('users').delete().eq('id', tenant.user_id)
      steps.push(error ? `user failed: ${error.message}` : 'user deleted')
    }

    return NextResponse.json({
      success: true,
      message: `Force-deleted ${tenant.first_name} ${tenant.last_name}`,
      steps,
      warnings: [
        tenant.stripe_subscription_id
          ? `Stripe Subscription ${tenant.stripe_subscription_id} still active — cancel in Stripe Dashboard.`
          : null,
        tenant.user_id
          ? 'Zitadel user still exists — delete in Zitadel admin UI to fully revoke access.'
          : null,
      ].filter(Boolean),
    })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (error instanceof Error && error.message === 'Forbidden') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    console.error('Force delete error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
