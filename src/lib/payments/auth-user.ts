import type { SupabaseClient } from '@supabase/supabase-js'

/** Resolve Supabase Auth user id by normalized email (profiles first, then auth.users). */
export async function findAuthUserIdByEmail(
  admin: SupabaseClient,
  email: string
): Promise<string | null> {
  const normalized = email.trim().toLowerCase()

  const { data: profile } = await admin
    .from('profiles')
    .select('id')
    .eq('email', normalized)
    .maybeSingle()

  if (profile?.id) return profile.id

  let page = 1
  const perPage = 1000

  while (true) {
    const { data: listed, error } = await admin.auth.admin.listUsers({ page, perPage })
    if (error) throw new Error(error.message)

    const match = listed.users.find((user) => user.email?.toLowerCase() === normalized)
    if (match?.id) return match.id

    if (listed.users.length < perPage) break
    page += 1
  }

  return null
}
