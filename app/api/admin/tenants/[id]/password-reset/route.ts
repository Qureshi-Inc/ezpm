/**
 * POST /api/admin/tenants/[id]/password-reset
 *
 * Emails the tenant a Zitadel password-reset link. Zitadel owns passwords in
 * the OIDC world, so the admin can't set one directly — this triggers Zitadel's
 * hosted reset flow. Requires the tenant to have logged in at least once (so we
 * have their zitadel_subject / user id).
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { createServerSupabaseClient } from '@/lib/supabase'
import { sendPasswordReset, isConfigured } from '@/lib/zitadel'

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireAdmin()
    const { id } = await params

    if (!isConfigured()) {
      return NextResponse.json(
        { error: 'Zitadel admin integration is not configured on this server.' },
        { status: 503 },
      )
    }

    const supabase = createServerSupabaseClient()

    const { data: tenant, error: tenantError } = await supabase
      .from('tenants')
      .select('id, email, user_id')
      .eq('id', id)
      .single()

    if (tenantError || !tenant) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })
    }
    if (!tenant.user_id) {
      return NextResponse.json(
        { error: "This tenant hasn't logged in yet, so there's no account to reset. Resend their invite instead." },
        { status: 400 },
      )
    }

    const { data: user } = await supabase
      .from('users')
      .select('zitadel_subject')
      .eq('id', tenant.user_id)
      .maybeSingle()

    if (!user?.zitadel_subject) {
      return NextResponse.json(
        { error: "Couldn't find this tenant's Zitadel account. They may need to log in once first." },
        { status: 400 },
      )
    }

    await sendPasswordReset({ userId: user.zitadel_subject })

    return NextResponse.json({
      success: true,
      message: `Password-reset link emailed to ${tenant.email}.`,
    })
  } catch (err) {
    console.error('[admin/password-reset] failed:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to send password reset' },
      { status: 500 },
    )
  }
}
