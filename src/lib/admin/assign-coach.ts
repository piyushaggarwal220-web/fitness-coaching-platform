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

  if (error) return { error: error.message }

  if (coachId) {
    const { data: openConvo } = await supabase
      .from('coach_conversations')
      .select('id, coach_id')
      .eq('client_id', clientId)
      .neq('status', 'closed')
      .maybeSingle()

    if (openConvo && openConvo.coach_id !== coachId) {
      await supabase
        .from('coach_conversations')
        .update({
          coach_id: coachId,
          updated_at: new Date().toISOString(),
        })
        .eq('id', openConvo.id)
    }
  }

  return { error: null }
}
