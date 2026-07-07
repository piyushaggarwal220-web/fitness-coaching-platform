import type { SupabaseClient } from '@supabase/supabase-js'
import type { AppRouterInstance } from 'next/dist/shared/lib/app-router-context.shared-runtime'
import { isAdminRole } from '@/lib/roles'
import type { Profile } from '@/types/database'

export type AdminProfile = Pick<Profile, 'id' | 'name' | 'email' | 'role'>

/** Returns the logged-in admin profile or redirects and returns null. */
export async function requireAdmin(
  supabase: SupabaseClient,
  router: AppRouterInstance
): Promise<AdminProfile | null> {
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    router.push('/admin/login')
    return null
  }

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('id, name, email, role')
    .eq('id', user.id)
    .maybeSingle()

  if (error || !profile || !isAdminRole(profile.role)) {
    router.push('/admin/login')
    return null
  }

  return profile as AdminProfile
}
