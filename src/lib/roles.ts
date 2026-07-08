export type UserRole = 'client' | 'coach' | 'admin' | 'super_admin'

export const ADMIN_ROLES: UserRole[] = ['admin', 'super_admin']

export function isAdminRole(role: string | null | undefined): role is 'admin' | 'super_admin' {
  return role === 'admin' || role === 'super_admin'
}

export function isSuperAdminRole(role: string | null | undefined): role is 'super_admin' {
  return role === 'super_admin'
}

export function formatUserRole(role: string | null | undefined): string {
  if (!role) return 'Client'
  return role
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}
