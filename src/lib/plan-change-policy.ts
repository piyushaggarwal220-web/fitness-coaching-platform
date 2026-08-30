/** Longer than /api/plan-change-requests/process maxDuration (300s) so a live worker is not stolen. */
export const PLAN_CHANGE_CLAIM_STALE_MS = 8 * 60 * 1000

export function planChangeRequestMarker(requestId: string): string {
  return `Request id: ${requestId}`
}

export function notesBelongToPlanChangeRequest(
  coachNotes: string | null | undefined,
  requestId: string
): boolean {
  if (!requestId || !coachNotes) return false
  return coachNotes.includes(planChangeRequestMarker(requestId))
}

export function canClaimPlanChangeGeneration(input: {
  status: string
  generationStartedAt: string | null
  draftPlanId: string | null
  draftReadyAt?: string | null
  nowMs?: number
}): boolean {
  if (input.status !== 'generating') return false
  if (input.draftReadyAt) return false
  if (input.draftPlanId) {
    if (!input.generationStartedAt) return false
    const startedAt = new Date(input.generationStartedAt).getTime()
    if (!Number.isFinite(startedAt)) return false
    const now = input.nowMs ?? Date.now()
    return now - startedAt >= PLAN_CHANGE_CLAIM_STALE_MS
  }
  if (!input.generationStartedAt) return true
  const startedAt = new Date(input.generationStartedAt).getTime()
  if (!Number.isFinite(startedAt)) return true
  const now = input.nowMs ?? Date.now()
  return now - startedAt >= PLAN_CHANGE_CLAIM_STALE_MS
}

export function stillOwnsPlanChangeClaim(
  row: { status: string; generation_started_at: string | null },
  claimedStartedAt: string
): boolean {
  if (row.status !== 'generating' || !row.generation_started_at) return false
  const owned = new Date(row.generation_started_at).getTime()
  const claimed = new Date(claimedStartedAt).getTime()
  return Number.isFinite(owned) && owned === claimed
}
