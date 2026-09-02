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
    const now = new Date().toISOString()
    await Promise.all([
      supabase.from('plans').update({ coach_id: coachId }).eq('client_id', clientId),
      supabase.from('checkins').update({ coach_id: coachId }).eq('client_id', clientId),
      supabase
        .from('coach_conversations')
        .update({ coach_id: coachId, updated_at: now })
        .eq('client_id', clientId),
      supabase.from('call_requests').update({ coach_id: coachId }).eq('client_id', clientId),
      supabase.from('plan_change_requests').update({ coach_id: coachId }).eq('client_id', clientId),
      supabase
        .from('initial_plan_generation_jobs')
        .update({ coach_id: coachId })
        .eq('client_id', clientId),
    ])
  }

  return { error: null }
}
