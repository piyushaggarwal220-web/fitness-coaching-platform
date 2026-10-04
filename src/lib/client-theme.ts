'use client'

import { usePathname } from 'next/navigation'
import { clientColors, colors } from '@/lib/design-tokens'

const CLIENT_ROOTS = [
  '/dashboard',
  '/tracker',
  '/plan',
  '/journey',
  '/client',
  '/checkin',
  '/profile',
  '/settings',
  '/workouts',
  '/library',
  '/unlock',
  '/supplement-protocol',
  '/login',
  '/onboarding',
  '/create-account',
  '/signup',
  '/forgot-password',
  '/reset-password',
  '/enroll',
  '/membership-required',
  '/league',
  '/install',
]

export function isClientAppPath(pathname: string | null | undefined): boolean {
  if (!pathname) return false
  return CLIENT_ROOTS.some((root) => pathname === root || pathname.startsWith(`${root}/`))
}

export function usePortalColors() {
  const pathname = usePathname()
  return isClientAppPath(pathname) ? clientColors : colors
}
