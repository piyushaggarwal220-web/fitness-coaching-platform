/** Rebuild today's tracker after plan publish or an active-plan edit. */
export function syncTrackerAfterPlanPublish(clientId: string, planId: string): void {
  void fetch('/api/tracker/sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clientId, planId }),
  }).catch(() => {
    /* non-blocking — tracker rebuilds on next open if plan.updated_at is newer */
  })
}
