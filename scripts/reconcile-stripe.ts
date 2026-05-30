/**
 * CLI wrapper around lib/stripe-reconcile.
 *
 * Usage (from the ezpm repo root):
 *   npm run reconcile-stripe                              # replay from watermark
 *   npm run reconcile-stripe -- --since 2026-05-01T00:00:00Z
 *   npm run reconcile-stripe -- --dry-run
 *
 * Schedule: invoke from a Coolify scheduled task (daily is fine) as a
 * backstop against missed webhooks. If your server has been down for
 * >30 days, Stripe forgets events and you'll need to reconstruct from the
 * Stripe Dashboard manually.
 */

import { config as loadEnv } from 'dotenv'
loadEnv({ path: '.env.local' })
loadEnv({ path: '.env' })

import { reconcileStripeEvents } from '@/lib/stripe-reconcile'

interface Args {
  since?: number
  dryRun: boolean
}

function parseArgs(argv: string[]): Args {
  const args: Args = { dryRun: false }
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--dry-run') {
      args.dryRun = true
    } else if (a === '--since') {
      const v = argv[++i]
      const ts = Math.floor(new Date(v).getTime() / 1000)
      if (!Number.isFinite(ts)) throw new Error(`Invalid --since: ${v}`)
      args.since = ts
    }
  }
  return args
}

async function main() {
  const args = parseArgs(process.argv)
  console.log(
    `Reconciling Stripe events ${args.since ? `since ${new Date(args.since * 1000).toISOString()}` : 'from watermark'} (${args.dryRun ? 'DRY-RUN' : 'LIVE'})`,
  )

  const result = await reconcileStripeEvents({ since: args.since, dryRun: args.dryRun })

  console.log(
    `Done. processed=${result.processed} skipped(already-seen)=${result.skipped} unhandled=${result.unhandled}`,
  )
  console.log(`Watermark: ${new Date(result.highestSeenAt * 1000).toISOString()}${result.watermarkUpdated ? ' (updated)' : ''}`)
}

main().catch((err) => {
  console.error('Reconcile failed:', err)
  process.exit(1)
})
