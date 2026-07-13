export function syncTrackerAfterPlanPublish(clientId: string, planId: string): void {
  void fetch('/api/tracker/sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clientId, planId }),
  }).catch(() => {
    /* non-blocking — client page will rebuild on open */
  })
}
