/**
 * PATCH /api/admin/maintenance/[id] — admin changes a request's status.
 *
 * Admin-only (requireAdmin). Valid statuses: open | in_progress | resolved |
 * cancelled. All side effects (tenant email + Mattermost emoji reaction) live
 * in applyMaintenanceStatus so the web UI and Mattermost-reaction paths match.
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { type MaintenanceStatus } from '@/lib/email'
import { applyMaintenanceStatus, MAINT_STATUSES } from '@/lib/maintenance-status'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireAdmin()
    const { id } = await params
    const { status } = await request.json().catch(() => ({ status: undefined }))

    if (!MAINT_STATUSES.includes(status as MaintenanceStatus)) {
      return NextResponse.json({ error: 'Invalid status.' }, { status: 400 })
    }

    const result = await applyMaintenanceStatus(id, status as MaintenanceStatus)
    if (result.notFound) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    if (!result.ok) {
      return NextResponse.json({ error: 'Failed to update status.' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (error instanceof Error && error.message === 'Forbidden') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
