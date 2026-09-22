/**
 * Error classification + bounded retry policy.
 */

import type { ErrorClass } from '@/lib/jarvis/execution/policy/types'

export function classifyError(err: unknown): ErrorClass {
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase()
  if (msg.includes('rate limit') || msg.includes('429') || msg.includes('too many')) return 'RATE_LIMIT'
  if (msg.includes('401') || msg.includes('403') || msg.includes('unauthorized') || msg.includes('auth'))
    return 'AUTH'
  if (msg.includes('404') || msg.includes('not found')) return 'NOT_FOUND'
  if (msg.includes('409') || msg.includes('conflict') || msg.includes('duplicate')) return 'CONFLICT'
  if (msg.includes('validation') || msg.includes('invalid') || msg.includes('400')) return 'VALIDATION'
  if (msg.includes('permission') || msg.includes('forbidden') || msg.includes('blocked')) return 'PERMISSION'
  if (msg.includes('timeout') || msg.includes('econnreset') || msg.includes('temporar') || msg.includes('503'))
    return 'TRANSIENT'
  if (msg.includes('provider') || msg.includes('graph') || msg.includes('shopify') || msg.includes('shotstack'))
    return 'PROVIDER'
  return 'UNKNOWN'
}

export function shouldRetry(errorClass: ErrorClass, attempt: number, maxAttempts = 3): boolean {
  if (attempt >= maxAttempts) return false
  return errorClass === 'TRANSIENT' || errorClass === 'RATE_LIMIT' || errorClass === 'PROVIDER'
}

export function backoffMs(attempt: number): number {
  return Math.min(30_000, 500 * Math.pow(2, attempt))
}
