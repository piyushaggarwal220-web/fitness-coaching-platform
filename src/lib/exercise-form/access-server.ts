import { createAdminClient } from '@/lib/supabase/admin'
import { profileEntitledForExerciseLibrary } from '@/lib/addon-protocols'
import {
  resolveExerciseVideoAccess,
  type ExerciseVideoAccess,
  type ExerciseVideoPurchase,
} from '@/lib/exercise-form/access'

function asPurchase(row: Record<string, unknown>): ExerciseVideoPurchase {
  return {
    status: (row.status as string | null) ?? null,
    amount_paise: (row.amount_paise as number | null) ?? null,
    refunded_amount_paise: (row.refunded_amount_paise as number | null) ?? null,
    subscription_status: (row.subscription_status as string | null) ?? null,
    plan_slug: (row.plan_slug as string | null) ?? null,
    created_at: (row.created_at as string | null) ?? null,
  }
}

export async function loadExerciseVideoAccess(input: {
  userId: string
  lifetimeLibrary?: boolean | null
}): Promise<ExerciseVideoAccess> {
  const admin = createAdminClient()
  let lifetimeLibrary = input.lifetimeLibrary === true

  if (input.lifetimeLibrary == null) {
    const { data, error } = await admin
      .from('profiles')
      .select('exercise_library_entitled')
      .eq('id', input.userId)
      .maybeSingle()
    if (error) throw new Error(error.message)
    lifetimeLibrary = profileEntitledForExerciseLibrary(data)
  }

  const { data, error } = await admin
    .from('purchases')
    .select('status, amount_paise, refunded_amount_paise, subscription_status, plan_slug, created_at')
    .eq('user_id', input.userId)
    .in('status', ['captured', 'redeemed'])
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) throw new Error(error.message)

  return resolveExerciseVideoAccess({
    lifetimeLibrary,
    purchases: ((data ?? []) as Record<string, unknown>[]).map(asPurchase),
  })
}
