import { createAdminClient } from '@/lib/supabase/admin'
import { hasAccessSourceColumn } from '@/lib/db/profile-columns'
import { deactivatePlan } from '@/lib/plans'

/**
 * Repair impossible client workflow states at the database level.
 * - plan_delivered without onboarding → deactivate plans
 * - payment_confirmed without access_source → tag admin_trial or purchase
 */
export async function repairClientWorkflowConsistency(clientId: string): Promise<void> {
  const admin = createAdminClient()
  const includeAccessSource = await hasAccessSourceColumn()

  const { data: profile, error } = await admin
    .from('profiles')
    .select('id, onboarding_complete, plan_delivered, payment_confirmed, access_source')
    .eq('id', clientId)
    .maybeSingle()

  if (error) throw new Error(error.message)
  if (!profile) return

  if (includeAccessSource && profile.payment_confirmed && !profile.access_source) {
    const { count } = await admin
      .from('purchases')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', clientId)

    await admin
      .from('profiles')
      .update({
        access_source: (count ?? 0) > 0 ? 'purchase' : 'admin_trial',
        updated_at: new Date().toISOString(),
      })
      .eq('id', clientId)
  }

  if (profile.plan_delivered && !profile.onboarding_complete) {
    const { data: activePlans } = await admin
      .from('plans')
      .select('id, client_id')
      .eq('client_id', clientId)
      .eq('active', true)

    for (const plan of activePlans ?? []) {
      const { error: deactivateError } = await deactivatePlan(admin, plan)
      if (deactivateError) throw new Error(deactivateError)
    }
  }
}
