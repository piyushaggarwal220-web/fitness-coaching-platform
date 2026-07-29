const RELOAD_GUARD_KEY = 'lurvox:chunk-reload-at'
const RELOAD_COOLDOWN_MS = 45_000

export function isChunkLoadError(error: unknown): boolean {
  if (!error) return false
  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : typeof error === 'object' && 'message' in error
          ? String((error as { message?: unknown }).message ?? '')
          : ''

  const name = error instanceof Error ? error.name : ''
  return (
    name === 'ChunkLoadError' ||
    /Loading chunk [\w-]+ failed/i.test(message) ||
    /Failed to load chunk/i.test(message) ||
    /Importing a module script failed/i.test(message) ||
    /error loading dynamically imported module/i.test(message)
  )
}

/** Soft-reload once after a deploy so the browser picks up the new chunk map. */
export function reloadForNewDeployment(_reason = 'chunk'): boolean {
  if (typeof window === 'undefined') return false
  const now = Date.now()
  try {
    const previous = Number(sessionStorage.getItem(RELOAD_GUARD_KEY) ?? '')
    if (Number.isFinite(previous) && now - previous < RELOAD_COOLDOWN_MS) {
      return false
    }
    sessionStorage.setItem(RELOAD_GUARD_KEY, String(now))
  } catch {
    // sessionStorage may be blocked; still attempt a reload.
  }
  window.location.reload()
  return true
}
