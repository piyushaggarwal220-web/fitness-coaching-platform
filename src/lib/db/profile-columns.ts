import { createAdminClient } from '@/lib/supabase/admin'

let accessSourceColumnCached: boolean | null = null

/** Whether profiles.access_source exists (migration 20260708000000). */
export async function hasAccessSourceColumn(): Promise<boolean> {
  if (accessSourceColumnCached !== null) return accessSourceColumnCached

  const admin = createAdminClient()
  const { error } = await admin.from('profiles').select('access_source').limit(0)
  accessSourceColumnCached = !error
  return accessSourceColumnCached
}
