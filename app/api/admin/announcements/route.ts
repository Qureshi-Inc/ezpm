/**
 * Admin announcements API.
 *   GET  /api/admin/announcements — list all announcements (newest first)
 *   POST /api/admin/announcements — publish an announcement; optionally email
 *                                   every tenant who has an address on file.
 *
 * Email is fire-and-forget and independent of the payment flow.
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { createServerSupabaseClient } from '@/lib/supabase'
import { renderAnnouncementEmail, sendEmail } from '@/lib/email'

export async function GET() {
  try {
    await requireAdmin()
    const supabase = createServerSupabaseClient()
    const { data, error } = await supabase
      .from('announcements')
      .select('id, title, body, created_at')
      .order('created_at', { ascending: false })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ announcements: data ?? [] })
  } catch (err) {
    console.error('[admin/announcements/list] failed:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireAdmin()
    const { title, body, sendEmail: emailToo } = await request.json()

    const cleanTitle = String(title || '').trim()
    const cleanBody = String(body || '').trim()
    if (!cleanTitle || !cleanBody) {
      return NextResponse.json({ error: 'Title and message are both required.' }, { status: 400 })
    }
    if (cleanTitle.length > 200) {
      return NextResponse.json({ error: 'Title is too long (max 200 characters).' }, { status: 400 })
    }

    const supabase = createServerSupabaseClient()
    const { data: created, error } = await supabase
      .from('announcements')
      .insert({ title: cleanTitle, body: cleanBody, created_by: session.userId })
      .select('id, title, body, created_at')
      .single()

    if (error || !created) {
      console.error('[admin/announcements/create] insert error:', error)
      return NextResponse.json({ error: 'Failed to publish announcement.' }, { status: 500 })
    }

    let emailedCount = 0
    if (emailToo) {
      const { data: tenants } = await supabase
        .from('tenants')
        .select('email, first_name, last_name')
        .not('email', 'is', null)
      const { subject, html } = renderAnnouncementEmail({ title: cleanTitle, body: cleanBody })
      const recipients = tenants ?? []
      // Send sequentially-ish but don't block forever; fire-and-forget each.
      await Promise.allSettled(
        recipients.map((t) =>
          sendEmail({
            to: t.email,
            toName: [t.first_name, t.last_name].filter(Boolean).join(' ') || t.email,
            subject,
            html,
          }),
        ),
      )
      emailedCount = recipients.length
    }

    return NextResponse.json({ success: true, announcement: created, emailedCount })
  } catch (err) {
    console.error('[admin/announcements/create] failed:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
