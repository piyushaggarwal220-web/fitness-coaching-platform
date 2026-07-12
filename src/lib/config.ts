/**
 * Platform configuration — controlled via environment variables.
 * Production code paths remain unchanged when switching modes.
 */

import { isTestModeServer, isTestModeEnabled } from '@/lib/test-mode'

/** Server: development mode bypasses payment and auto-assigns coach. Never in production. */
export function isDevelopmentModeServer(): boolean {
  if (process.env.NODE_ENV === 'production') return false
  return (
    process.env.DEVELOPMENT_MODE === 'true' ||
    process.env.TEST_MODE === 'true' ||
    process.env.DEV_MODE === 'true' ||
    process.env.NODE_ENV === 'development'
  )
}

/** Client: development mode UI indicators. Never in production. */
export function isDevelopmentModeClient(): boolean {
  if (process.env.NODE_ENV === 'production') return false
  return (
    process.env.NEXT_PUBLIC_DEVELOPMENT_MODE === 'true' ||
    process.env.NEXT_PUBLIC_TEST_MODE === 'true' ||
    process.env.NEXT_PUBLIC_DEV_MODE === 'true' ||
    isTestModeEnabled()
  )
}

/** Whether payment should be bypassed (dev/test only). */
export function shouldBypassPayment(): boolean {
  return isDevelopmentModeServer() || isTestModeServer()
}

/** Whether to auto-assign a coach after entitlement grant (dev mode). */
export function shouldAutoAssignCoach(): boolean {
  return isDevelopmentModeServer()
}

/** Whether redemption codes are enabled (always in production). */
export function isRedemptionEnabled(): boolean {
  return true
}
