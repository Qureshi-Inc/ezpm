/**
 * Client-side Stripe loader.
 *
 * Hoisted to module scope so loadStripe() runs exactly once per page lifecycle
 * (instead of once per call). loadStripe is internally idempotent, but the old
 * call-per-invocation pattern still re-ran the type-narrowing branch and lost
 * the cached Promise on hot reloads.
 */

import { loadStripe, type Stripe } from '@stripe/stripe-js'

const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY

if (!publishableKey && typeof window !== 'undefined') {
  // Surface this loudly in dev. Don't throw — pages that don't actually use
  // Stripe shouldn't crash just because env wiring is incomplete.
  console.error('NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY is not set')
}

const stripePromise: Promise<Stripe | null> = publishableKey
  ? loadStripe(publishableKey)
  : Promise.resolve(null)

export const getStripe = () => stripePromise
