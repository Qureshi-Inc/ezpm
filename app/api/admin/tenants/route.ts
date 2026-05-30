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
import * as zitadel from '@/lib/zitadel'

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

    // Zitadel invite: create + invite the user automatically. Zitadel sends
    // the email and handles the verify + password setup flow in its hosted
    // login UI (auth.getezpm.com/ui/v2/login/verify). The tenant ends up
    // back at app.getezpm.com via the OIDC callback once they're done.
    //
    // Failures are non-fatal — the tenant row is already saved and admin
    // can fall back to manual invite via Zitadel admin UI. We surface the
    // status in the response so the form can warn the admin.
    let zitadelStatus: 'invited' | 'manual_fallback' | 'disabled' = 'disabled'
    let zitadelMessage: string | undefined
    if (zitadel.isConfigured()) {
      try {
        const created = await zitadel.createHumanUser({
          email,
          firstName,
          lastName,
        })
        await zitadel.sendInvitation({
          userId: created.userId,
          applicationName: 'EZPM Rent Portal',
        })
        zitadelStatus = 'invited'
        zitadelMessage = created.alreadyExisted
          ? `Existing Zitadel user found for ${email}; new invitation email sent.`
          : `Invitation email sent to ${email} via Zitadel.`
      } catch (err) {
        console.error('Zitadel invite failed (tenant row still saved):', err)
        zitadelStatus = 'manual_fallback'
        zitadelMessage = `Auto-invite failed (${err instanceof Error ? err.message : 'unknown'}). Invite ${email} manually in Zitadel admin.`
      }
    } else {
      zitadelMessage = `Zitadel auto-invite disabled (ZITADEL_SERVICE_TOKEN not set). Invite ${email} manually in Zitadel admin.`
    }

    return NextResponse.json({
      success: true,
      message: zitadelStatus === 'invited'
        ? `Tenant ${firstName} ${lastName} created and invited.`
        : `Tenant ${firstName} ${lastName} created. ${zitadelMessage}`,
      tenant: newTenant,
      zitadelStatus,
      zitadelMessage,
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
