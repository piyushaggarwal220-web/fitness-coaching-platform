import type { SupabaseClient } from '@supabase/supabase-js'
import type { AppRouterInstance } from 'next/dist/shared/lib/app-router-context.shared-runtime'
import type { Coach } from '@/types/database'

/** Returns the logged-in coach row or redirects and returns null. */
export async function requireCoach(
  supabase: SupabaseClient,
  router: AppRouterInstance
): Promise<Coach | null> {
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    router.push('/coach/login')
    return null
  }

  const { data: coachData, error: coachError } = await supabase
    .from('coaches')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle()

  if (coachError) {
    router.push('/dashboard')
    return null
  }

  if (!coachData) {
    router.push('/dashboard')
    return null
  }

  return coachData as Coach
}
