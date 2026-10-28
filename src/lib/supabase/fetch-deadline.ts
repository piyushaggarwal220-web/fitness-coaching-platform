/** Auth and data calls must fail instead of leaving the app on "Restoring your session...". */
export const SUPABASE_FETCH_TIMEOUT_MS = 8000

export function fetchWithDeadline(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), SUPABASE_FETCH_TIMEOUT_MS)
  if (init?.signal?.aborted) controller.abort()
  else init?.signal?.addEventListener('abort', () => controller.abort(), { once: true })
  return fetch(input, { ...init, signal: controller.signal }).finally(() => clearTimeout(timer))
}
