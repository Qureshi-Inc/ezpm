/**
 * POST /api/admin/tenants — admin pre-stages a tenant.
 *
 * Creates the tenants row keyed by email (user_id stays NULL until the
 * tenant accepts the Zitadel invite and logs in for the first time, at
 * which point lib/provision.ts links them). Admin must separately invite
 * the email via Zitadel admin UI for now — auto-invite via Zitadel API is
 * captured as a follow-up TODO.
 *
 * No password handling. Zitadel owns the password lifecycle.
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { createServerSupabaseClient } from '@/lib/supabase'

export async function POST(request: NextRequest) {
  try {
    await requireAdmin()

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

    const { data: existingTenant } = await supabase
      .from('tenants')
      .select('id')
      .eq('email', email)
      .maybeSingle()
    if (existingTenant) {
      return NextResponse.json(
        { error: 'A tenant with this email already exists' },
        { status: 400 },
      )
    }

    const tenantData: Record<string, unknown> = {
      email,
      first_name: firstName,
      last_name: lastName,
      phone: phone || null,
      payment_due_day: paymentDueDay || 1,
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
      return NextResponse.json(
        { error: `Failed to create tenant: ${tenantError.message}` },
        { status: 500 },
      )
    }

    // Stripe Customer + Subscription wiring happens when the tenant
    // first adds a payment method (handled in lib/stripe-subscriptions.ts,
    // T4). No charge until they pay something.

    return NextResponse.json({
      success: true,
      message: `Tenant ${firstName} ${lastName} pre-staged. Invite ${email} via Zitadel admin to complete onboarding.`,
      tenant: newTenant,
    })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (error instanceof Error && error.message === 'Forbidden') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    console.error('Create tenant error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
