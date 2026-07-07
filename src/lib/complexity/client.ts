/** Client-side helper to trigger complexity recalculation after profile events. */
export async function requestComplexityRecalculation(options: {
  clientId?: string
  trigger:
    | 'onboarding_complete'
    | 'weekly_checkin'
    | 'profile_edit_client'
    | 'profile_edit_coach'
    | 'profile_edit_admin'
  checkinId?: string
}): Promise<void> {
  try {
    await fetch('/api/complexity/recalculate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(options),
    })
  } catch {
    // Non-blocking — score can be recalculated on next trigger
  }
}
