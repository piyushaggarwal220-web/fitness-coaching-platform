import { isDevelopmentModeServer } from '@/lib/config'

type ApiDevLogInput = Record<string, unknown>

/** Structured API logging — development only, never exposed to clients. */
export function logApiDev(event: string, input: ApiDevLogInput): void {
  if (!isDevelopmentModeServer()) return
  console.info(`[api-dev] ${event}`, JSON.stringify({ ...input, at: new Date().toISOString() }))
}
