/** Rebuild today's tracker after plan publish or an active-plan edit. */

export async function syncTrackerAfterPlanPublishAsync(
  clientId: string,
  planId: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch('/api/tracker/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId, planId }),
    })
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string }
      return { ok: false, error: data.error ?? 'Tracker sync failed' }
    }
    return { ok: true }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Tracker sync failed',
    }
  }
}

/** Fire-and-forget wrapper for places that do not wait on sync. */
export function syncTrackerAfterPlanPublish(clientId: string, planId: string): void {
  void syncTrackerAfterPlanPublishAsync(clientId, planId)
}
