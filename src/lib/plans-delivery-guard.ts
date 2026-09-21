import type { SupabaseClient } from '@supabase/supabase-js'

/** Fail closed: never treat a lookup error as “no delivered plan”. */
export async function clientHasDeliveredPlanStrict(
  admin: SupabaseClient,
  clientId: string
): Promise<{ delivered: boolean; error: string | null }> {
  const { count, error } = await admin
    .from('plans')
    .select('id', { count: 'exact', head: true })
    .eq('client_id', clientId)
    .not('delivered_at', 'is', null)

  if (error) return { delivered: false, error: error.message }
  return { delivered: (count ?? 0) > 0, error: null }
}
