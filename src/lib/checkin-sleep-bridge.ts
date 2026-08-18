/**
 * Bridge between daily tracker sleep logs and check-in sleep_quality (1–10).
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { scoreToQualityLabel } from '@/lib/daily-tracker/display'
import { loadTrackerHistory } from '@/lib/daily-tracker/service'
import type { DailyTrackerDay, SleepCompletion, SleepQualityLabel } from '@/lib/daily-tracker/types'

export type SleepBridgeSuggestion = {
  sleepQuality: number | null
  energy: number | null
  sampleCount: number
}

function clampScore(value: number): number {
  return Math.min(10, Math.max(1, Math.round(value)))
}

function labelFromScore(score: number): SleepQualityLabel {
  const pretty = scoreToQualityLabel(score)?.toLowerCase()
  if (pretty === 'excellent' || pretty === 'good' || pretty === 'average' || pretty === 'poor') {
    return pretty
  }
  return 'average'
}

/** Average logged tracker sleep quality/energy since an optional date (exclusive). */
export function averageSleepMetricsFromDays(
  days: Array<Pick<DailyTrackerDay, 'log_date' | 'completion'>>,
  options?: { sinceLogDate?: string | null; maxDays?: number }
): SleepBridgeSuggestion {
  const since = options?.sinceLogDate?.slice(0, 10) ?? null
  const maxDays = options?.maxDays ?? 7
  const qualities: number[] = []
  const energies: number[] = []

  for (const day of days) {
    if (since && day.log_date.slice(0, 10) <= since) continue
    const sleep = day.completion?.sleep
    if (!sleep) continue
    if (typeof sleep.quality === 'number' && Number.isFinite(sleep.quality)) {
      qualities.push(Math.min(10, Math.max(0, sleep.quality)))
    }
    if (typeof sleep.energy === 'number' && Number.isFinite(sleep.energy)) {
      energies.push(Math.min(10, Math.max(1, sleep.energy)))
    }
  }

  // Days are expected newest-first from loadTrackerHistory.
  const recentQuality = qualities.slice(0, maxDays)
  const recentEnergy = energies.slice(0, maxDays)

  return {
    sleepQuality:
      recentQuality.length > 0
        ? clampScore(recentQuality.reduce((a, b) => a + b, 0) / recentQuality.length)
        : null,
    energy:
      recentEnergy.length > 0
        ? clampScore(recentEnergy.reduce((a, b) => a + b, 0) / recentEnergy.length)
        : null,
    sampleCount: Math.max(recentQuality.length, recentEnergy.length),
  }
}

/** Map a check-in 1–10 sleep score onto tracker sleep fields. */
export function checkinSleepToTrackerPatch(sleepQuality: number): Pick<
  SleepCompletion,
  'quality' | 'qualityLabel'
> {
  const quality = clampScore(sleepQuality)
  return {
    quality,
    qualityLabel: labelFromScore(quality),
  }
}

export function shouldWriteBackCheckinSleepToTracker(
  sleep: SleepCompletion | null | undefined
): boolean {
  if (!sleep) return true
  return sleep.quality == null
}

/** Load suggestion for check-in sliders from recent tracker sleep logs. */
export async function loadCheckinSleepSuggestion(
  supabase: SupabaseClient,
  clientId: string
): Promise<SleepBridgeSuggestion> {
  const [{ data: lastCheckin }, days] = await Promise.all([
    supabase
      .from('checkins')
      .select('submitted_at')
      .eq('client_id', clientId)
      .order('submitted_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    loadTrackerHistory(supabase, clientId, 14),
  ])

  const sinceLogDate = lastCheckin?.submitted_at
    ? String(lastCheckin.submitted_at).slice(0, 10)
    : null

  return averageSleepMetricsFromDays(days, { sinceLogDate, maxDays: 7 })
}
