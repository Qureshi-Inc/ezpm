/**
 * PUT  /api/admin/tenants/[id] — update tenant metadata (no auth fields)
 * DELETE /api/admin/tenants/[id] — delete tenant; force=true also wipes payments + payment methods
 *
 * Password updates are removed entirely. Zitadel owns the password lifecycle —
 * if a tenant needs a password reset, admin does it in the Zitadel admin UI.
 *
 * Email updates are allowed but flagged: if the tenant has already linked to a
 * Zitadel user (user_id IS NOT NULL), changing the email here only changes the
 * local mirror. The tenant must still log in with their existing Zitadel email.
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { createServerSupabaseClient } from '@/lib/supabase'

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireAdmin()

    const { id } = await params
    const { email, firstName, lastName, phone, propertyId, paymentDueDay } = await request.json()

    if (!email || !firstName || !lastName) {
      return NextResponse.json(
        { error: 'Email, first name, and last name are required' },
        { status: 400 },
      )
    }
    if (paymentDueDay && (paymentDueDay < 1 || paymentDueDay > 28)) {
      return NextResponse.json(
        { error: 'Payment due day must be between 1 and 28' },
        { status: 400 },
      )
    }

    const supabase = createServerSupabaseClient()

    const { data: tenant, error: tenantFetchError } = await supabase
      .from('tenants')
      .select('id, email, user_id, property_id, payment_due_day')
      .eq('id', id)
      .maybeSingle()
    if (tenantFetchError || !tenant) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })
    }

    // Email uniqueness (skip if unchanged)
    if (email !== tenant.email) {
      const { data: conflict } = await supabase
        .from('tenants')
        .select('id')
        .eq('email', email)
        .neq('id', id)
        .maybeSingle()
      if (conflict) {
        return NextResponse.json(
          { error: 'Another tenant already uses this email' },
          { status: 400 },
        )
      }
    }

    const tenantUpdateData: Record<string, unknown> = {
      email,
      first_name: firstName,
      last_name: lastName,
    }
    if (phone !== undefined) tenantUpdateData.phone = phone || null
    if (propertyId !== undefined) {
      tenantUpdateData.property_id = (propertyId && propertyId !== 'none') ? propertyId : null
    }
    if (paymentDueDay !== undefined) tenantUpdateData.payment_due_day = paymentDueDay

    const { data: updated, error: updateError } = await supabase
      .from('tenants')
      .update(tenantUpdateData)
      .eq('id', id)
      .select()
      .single()

    if (updateError) {
      return NextResponse.json(
        { error: `Failed to update tenant: ${updateError.message}` },
        { status: 500 },
      )
    }

    // Note: if rent_amount changes on the assigned property, the Stripe
    // Subscription price must be updated separately. That's handled in
    // lib/stripe-subscriptions.ts (T4) and called from the property update
    // route, not here.

    return NextResponse.json({
      success: true,
      message: 'Tenant updated',
      tenant: updated,
      warning: tenant.user_id && email !== tenant.email
        ? 'Tenant already linked to Zitadel; local email mirror updated but Zitadel email is unchanged. Update in Zitadel admin if needed.'
        : undefined,
    })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (error instanceof Error && error.message === 'Forbidden') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    console.error('Update tenant error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireAdmin()

    const { id } = await params
    const { force } = await request.json().catch(() => ({ force: false }))
    const supabase = createServerSupabaseClient()

    const { data: tenant, error: tenantFetchError } = await supabase
      .from('tenants')
      .select('user_id, first_name, last_name, stripe_subscription_id')
      .eq('id', id)
      .maybeSingle()
    if (tenantFetchError || !tenant) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })
    }

    // Existing payments? Refuse unless force=true.
    const { data: payments } = await supabase
      .from('payments')
      .select('id')
      .eq('tenant_id', id)
      .limit(1)
    if (payments && payments.length > 0 && !force) {
      return NextResponse.json(
        {
          error: 'Cannot delete tenant with payment history. Pass force=true to wipe everything.',
          hasPayments: true,
          tenantId: id,
        },
        { status: 400 },
      )
    }

    // Force wipe: payments + payment_methods. Tenants CASCADEs to these
    // via the schema's foreign keys (ON DELETE CASCADE) but we do it
    // explicitly here for clearer audit logs.
    if (force) {
      await supabase.from('payments').delete().eq('tenant_id', id)
      await supabase.from('payment_methods').delete().eq('tenant_id', id)
    }

    // TODO (T12 follow-up): if tenant.stripe_subscription_id is set, call
    // stripe.subscriptions.cancel() here to stop future charges. For now
    // admin must cancel in Stripe Dashboard before deleting.

    const { error: deleteTenantError } = await supabase
      .from('tenants')
      .delete()
      .eq('id', id)
    if (deleteTenantError) {
      return NextResponse.json(
        { error: 'Failed to delete tenant' },
        { status: 500 },
      )
    }

    // Delete the users row if it was linked. Zitadel still has the user;
    // admin should also delete from the Zitadel admin UI to fully revoke.
    if (tenant.user_id) {
      await supabase.from('users').delete().eq('id', tenant.user_id)
    }

    return NextResponse.json({
      success: true,
      message: `Tenant ${tenant.first_name} ${tenant.last_name} deleted`,
      warning: tenant.stripe_subscription_id
        ? `Stripe Subscription ${tenant.stripe_subscription_id} still active — cancel it in Stripe Dashboard.`
        : undefined,
    })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (error instanceof Error && error.message === 'Forbidden') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    console.error('Delete tenant error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
