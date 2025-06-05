import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { createServerSupabaseClient } from '@/lib/supabase'
import { checkAndGenerateMissingPayments } from '@/utils/payment-generation'

export async function POST(request: NextRequest) {
  try {
    await requireAdmin()
    
    const supabase = createServerSupabaseClient()
    const result = await checkAndGenerateMissingPayments(supabase)

    return NextResponse.json({
      success: true,
      message: `Checked ${result.checked} tenants. Generated ${result.generated} payments, found ${result.existing} existing, ${result.errors} errors.`,
      summary: {
        tenantsChecked: result.checked,
        paymentsGenerated: result.generated,
        paymentsExisting: result.existing,
        errors: result.errors
      },
      details: result.results,
      errorDetails: result.results.filter(r => r.action === 'error')
    })

  } catch (error) {
    console.error('Check missing payments error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
} 