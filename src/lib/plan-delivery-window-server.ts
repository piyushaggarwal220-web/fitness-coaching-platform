import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { instantPlanDeliverAt, instantPlanWindowOpen } from '@/lib/plan-delivery-window'

export async function readInstantPlanWindow(
  admin: SupabaseClient,
  clientId: string,
  now: Date = new Date()
): Promise<{ open: boolean; deliverAt: string | null }> {
  const { data } = await admin
    .from('profiles')
    .select('onboarding_completed_at')
    .eq('id', clientId)
    .maybeSingle()

  const at = instantPlanDeliverAt(data?.onboarding_completed_at ?? null, clientId)
  return {
    open: instantPlanWindowOpen(data?.onboarding_completed_at ?? null, clientId, now),
    deliverAt: at ? at.toISOString() : null,
  }
}
