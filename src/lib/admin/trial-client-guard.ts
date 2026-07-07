import { hasAccessSourceColumn } from '@/lib/db/profile-columns'
import { createAdminClient } from '@/lib/supabase/admin'

export type TrialClientSummary = {
  id: string
  name: string | null
  email: string | null
  coach_id: string | null
  onboarding_complete: boolean | null
  plan_delivered: boolean | null
}

type GuardProfile = {
  id: string
  email: string | null
  name: string | null
  role?: string | null
  access_source?: string | null
  payment_confirmed?: boolean | null
  coach_id?: string | null
}

export class TrialClientGuardError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'TrialClientGuardError'
  }
}

/** Ensure the client is an admin-created trial account (never a paying customer). */
export async function assertTrialClient(clientId: string): Promise<GuardProfile> {
  const admin = createAdminClient()
  const includeAccessSource = await hasAccessSourceColumn()

  const columns = includeAccessSource
    ? 'id, email, name, role, access_source, payment_confirmed, coach_id'
    : 'id, email, name, role, payment_confirmed, coach_id'

  const { data, error } = await admin
    .from('profiles')
    .select(columns)
    .eq('id', clientId)
    .maybeSingle()

  if (error) throw new Error(error.message)
  const profile = data as GuardProfile | null
  if (!profile) throw new TrialClientGuardError('Client not found.')

  if (profile.role && profile.role !== 'client') {
    throw new TrialClientGuardError('Only client accounts can be modified through Testing Tools.')
  }

  if (includeAccessSource) {
    if (profile.access_source !== 'admin_trial') {
      throw new TrialClientGuardError(
        'Only trial clients (access_source = admin_trial) can be modified. Paying customers cannot be reset.'
      )
    }
    return profile
  }

  const { count, error: purchaseError } = await admin
    .from('purchases')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', clientId)

  if (purchaseError) throw new Error(purchaseError.message)
  if ((count ?? 0) > 0) {
    throw new TrialClientGuardError('Cannot modify paying customers.')
  }

  if (!profile.payment_confirmed) {
    throw new TrialClientGuardError('Account does not have trial entitlement.')
  }

  return profile
}

/** List clients created via Testing Tools (admin_trial). */
export async function listTrialClients(): Promise<TrialClientSummary[]> {
  const admin = createAdminClient()
  const includeAccessSource = await hasAccessSourceColumn()

  if (includeAccessSource) {
    const { data, error } = await admin
      .from('profiles')
      .select('id, name, email, coach_id, onboarding_complete, plan_delivered')
      .eq('access_source', 'admin_trial')
      .order('name')

    if (error) throw new Error(error.message)
    return data ?? []
  }

  const [{ data: profiles, error: profileError }, { data: purchases, error: purchaseError }] =
    await Promise.all([
      admin
        .from('profiles')
        .select('id, name, email, coach_id, onboarding_complete, plan_delivered, role, payment_confirmed')
        .eq('payment_confirmed', true)
        .order('name'),
      admin.from('purchases').select('user_id'),
    ])

  if (profileError) throw new Error(profileError.message)
  if (purchaseError) throw new Error(purchaseError.message)

  const purchaseUserIds = new Set((purchases ?? []).map((row) => row.user_id).filter(Boolean))

  return (profiles ?? []).filter(
    (profile) =>
      (!profile.role || profile.role === 'client') &&
      profile.payment_confirmed === true &&
      !purchaseUserIds.has(profile.id)
  )
}
