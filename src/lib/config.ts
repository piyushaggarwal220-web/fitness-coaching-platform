/**
 * Platform configuration — controlled via environment variables.
 * Production code paths remain unchanged when switching modes.
 */

import { isTestModeServer, isTestModeEnabled } from '@/lib/test-mode'

/** Vercel Preview only — explicit opt-in. Never enabled on production deployments. */
export function isStagingPaymentBypassServer(): boolean {
  return (
    process.env.VERCEL_ENV === 'preview' &&
    process.env.STAGING_PAYMENT_BYPASS === 'true'
  )
}

/** Client mirror of staging bypass (requires NEXT_PUBLIC_VERCEL_ENV from build). */
export function isStagingPaymentBypassClient(): boolean {
  return (
    process.env.NEXT_PUBLIC_VERCEL_ENV === 'preview' &&
    process.env.NEXT_PUBLIC_STAGING_PAYMENT_BYPASS === 'true'
  )
}

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
  if (isStagingPaymentBypassClient()) return true
  if (process.env.NODE_ENV === 'production') return false
  return (
    process.env.NEXT_PUBLIC_DEVELOPMENT_MODE === 'true' ||
    process.env.NEXT_PUBLIC_TEST_MODE === 'true' ||
    process.env.NEXT_PUBLIC_DEV_MODE === 'true' ||
    isTestModeEnabled()
  )
}

/** Client checkout / route guards — dev, test, or Vercel Preview staging bypass. */
export function isPaymentBypassClient(): boolean {
  return isStagingPaymentBypassClient() || isDevelopmentModeClient() || isTestModeEnabled()
}

/** Whether payment should be bypassed (dev/test or Vercel Preview staging). */
export function shouldBypassPayment(): boolean {
  if (isStagingPaymentBypassServer()) return true
  if (process.env.NODE_ENV === 'production') return false
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
