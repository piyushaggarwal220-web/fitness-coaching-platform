import type { SupabaseClient } from '@supabase/supabase-js'

/** Assign or reassign a client to a coach. Reused by admin panel. */
export async function assignCoachToClient(
  supabase: SupabaseClient,
  clientId: string,
  coachId: string | null
): Promise<{ error: string | null }> {
  if (coachId) {
    const { data: coach, error: coachError } = await supabase
      .from('coaches')
      .select('id')
      .eq('id', coachId)
      .maybeSingle()

    if (coachError) return { error: coachError.message }
    if (!coach) return { error: 'Coach not found.' }
  }

  const { error } = await supabase
    .from('profiles')
    .update({
      coach_id: coachId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', clientId)

  return { error: error?.message ?? null }
}
