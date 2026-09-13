/** Coach-browser helper: publish via service-role API (avoids RLS on replace). */
export async function publishPlanViaApi(input: {
  clientId: string
  planId: string
  checkinId?: string | null
  checkinWeek?: number | null
}): Promise<{ ok: true; planId: string; alreadyActive?: boolean } | { ok: false; error: string }> {
  try {
    const res = await fetch('/api/coach/ai-draft/publish', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clientId: input.clientId,
        planId: input.planId,
        checkinId: input.checkinId ?? null,
        checkinWeek: input.checkinWeek ?? null,
      }),
    })
    const data = (await res.json().catch(() => null)) as {
      success?: boolean
      error?: string
      alreadyActive?: boolean
      planId?: string
    } | null

    if (!res.ok || !data?.success) {
      return { ok: false, error: data?.error ?? 'Failed to deliver plan.' }
    }

    return {
      ok: true,
      planId: data.planId ?? input.planId,
      alreadyActive: data.alreadyActive,
    }
  } catch {
    return { ok: false, error: 'Network error while delivering. Please try again.' }
  }
}
