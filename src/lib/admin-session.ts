import type { SupabaseClient } from '@supabase/supabase-js'
import type { AppRouterInstance } from 'next/dist/shared/lib/app-router-context.shared-runtime'
import { isAdminRole } from '@/lib/roles'
import {
  fetchAdminProfile,
  redirectToLogin,
  restoreSession,
} from '@/lib/session-restore'
import type { Profile } from '@/types/database'

export type AdminProfile = Pick<Profile, 'id' | 'name' | 'email' | 'role'>

/** Returns the logged-in admin profile or redirects and returns null. */
export async function requireAdmin(
  supabase: SupabaseClient,
  router: AppRouterInstance
): Promise<AdminProfile | null> {
  const restored = await restoreSession(supabase)

  if (restored.status === 'unauthenticated') {
    redirectToLogin(router, 'admin', 'session_expired')
    return null
  }

  if (restored.role !== 'admin') {
    redirectToLogin(router, 'admin', 'not_an_admin')
    return null
  }

  if (restored.status === 'profile_unavailable') {
    return null
  }

  const profile = restored.profile
  if (profile && isAdminRole(profile.role)) {
    return {
      id: profile.id,
      name: profile.name,
      email: profile.email,
      role: profile.role,
    }
  }

  const { profile: adminProfile, error } = await fetchAdminProfile(supabase, restored.user.id)
  if (adminProfile && isAdminRole(adminProfile.role)) {
    return adminProfile as AdminProfile
  }

  if (error) {
    return null
  }

  redirectToLogin(router, 'admin', 'admin_profile_missing')
  return null
}
