/**
 * First-user-becomes-admin bootstrap, plus tenant linkage by email.
 *
 * Called from auth.ts on the JWT callback (first sign-in only). Uses a
 * postgres advisory lock to make the empty-users-table check + insert
 * atomic, so two simultaneous first-time logins cannot both become admin
 * (closes blocker #2 from /plan-eng-review outside-voice review).
 *
 * Defense in depth: Zitadel self-registration is disabled on the ezpm org
 * (per F1), so in practice only invited users can hit this path.
 *
 * Tenant linkage: when role=tenant, we look up tenants WHERE email matches
 * and user_id IS NULL, then link them. The admin pre-stages tenants by
 * email in /admin/tenants/create; this is where the rows actually get
 * connected to a user.
 */

import { createServerSupabaseClient } from '@/lib/supabase'

// Constant chosen with no significance other than uniqueness within ezpm.
// pg_advisory_xact_lock takes a bigint and releases on transaction end.
const BOOTSTRAP_LOCK_KEY = 0x657a706d_61646d6e // 'ezpm_admn' in 8 hex chars

export interface ProvisionResult {
  user_id: string
  role: 'admin' | 'tenant'
}

export async function provisionUserFromZitadel(claims: {
  zitadel_subject: string
  email: string
  first_name: string | null
  last_name: string | null
}): Promise<ProvisionResult> {
  const supabase = createServerSupabaseClient()

  // 1. Already provisioned? Fast path.
  const { data: existing } = await supabase
    .from('users')
    .select('id, role')
    .eq('zitadel_subject', claims.zitadel_subject)
    .maybeSingle()

  if (existing) {
    return { user_id: existing.id, role: existing.role as 'admin' | 'tenant' }
  }

  // 2. Need to insert. Take the advisory lock so two concurrent first-logins
  //    can't race for the admin slot.
  //
  // Supabase RPC executes inside a single transaction, so the lock is
  // released automatically when this function returns. We implement the
  // critical section as a stored procedure to keep all steps in one txn —
  // mixing supabase-js .from() calls across requests can fragment the txn
  // boundary in pg-bouncer'd connection pools.
  //
  // The RPC is defined inline below if you'd rather not maintain a SQL
  // function; the .rpc() pathway is preferred when supabase-js is in use.

  const { data: provisioned, error } = await supabase.rpc(
    'provision_user_from_zitadel',
    {
      p_zitadel_subject: claims.zitadel_subject,
      p_email: claims.email,
      p_first_name: claims.first_name,
      p_last_name: claims.last_name,
      p_lock_key: BOOTSTRAP_LOCK_KEY,
    },
  )

  if (error) {
    throw new Error(`Provisioning failed for ${claims.email}: ${error.message}`)
  }
  if (!provisioned || provisioned.length === 0) {
    throw new Error(`Provisioning returned no row for ${claims.email}`)
  }

  // Supabase RPC returning SETOF wraps results in an array. The RPC returns
  // out_user_id / out_role (renamed from user_id/role to avoid postgres column
  // ambiguity inside the function body — see provision_user_from_zitadel in
  // supabase/schema.sql for the why).
  const row = Array.isArray(provisioned) ? provisioned[0] : provisioned
  return {
    user_id: row.out_user_id as string,
    role: row.out_role as 'admin' | 'tenant',
  }
}
