/**
 * Development-only helpers. Never enabled when NODE_ENV is production.
 */

import { isTestModeEnabled, isTestModeServer } from '@/lib/test-mode'

export function isDevModeServer(): boolean {
  if (process.env.NODE_ENV === 'production') return false
  return process.env.NODE_ENV === 'development' || process.env.DEV_MODE === 'true'
}

/** Client bundle — Next.js inlines NODE_ENV at build time. */
export function isDevModeClient(): boolean {
  if (process.env.NODE_ENV === 'production') return false
  return (
    process.env.NODE_ENV === 'development' || process.env.NEXT_PUBLIC_DEV_MODE === 'true'
  )
}

/** Skip payment gates on client routes (dev or TEST_MODE — never in production). */
export function shouldBypassPaymentGuardClient(): boolean {
  return isDevModeClient() || isTestModeEnabled()
}

/** Skip payment gates on server (dev or TEST_MODE — never in production). */
export function shouldBypassPaymentGuardServer(): boolean {
  return isDevModeServer() || isTestModeServer()
}

/** Dev APIs / panels — never in production builds. */
export function isDevToolkitEnabledServer(): boolean {
  return isDevModeServer()
}

export function isDevToolkitEnabledClient(): boolean {
  return isDevModeClient()
}
