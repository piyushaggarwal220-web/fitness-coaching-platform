import type { SupabaseClient } from '@supabase/supabase-js'
import type { Checkin } from '@/types/database'

function submittedMs(checkin: Checkin): number {
  const value = Date.parse(checkin.submitted_at)
  return Number.isFinite(value) ? value : 0
}

/** Same-week Day 3 check-in that should feed Sunday's next-week plan. */
export function pickSameWeekMidWeekCheckin(
  weekly: Pick<Checkin, 'id' | 'client_id' | 'coaching_week' | 'checkin_type'>,
  checkins: Checkin[]
): Checkin | null {
  if (weekly.checkin_type !== 'weekly') return null
  const week = weekly.coaching_week
  if (week == null) return null
  const matches = checkins
    .filter(
      (row) =>
        row.id !== weekly.id &&
        row.client_id === weekly.client_id &&
        row.checkin_type === 'mid_week' &&
        row.coaching_week === week
    )
    .sort((a, b) => submittedMs(b) - submittedMs(a))
  return matches[0] ?? null
}

export async function loadSameWeekMidWeekCheckin(
  admin: SupabaseClient,
  weekly: Pick<Checkin, 'id' | 'client_id' | 'coaching_week' | 'checkin_type'>
): Promise<Checkin | null> {
  if (weekly.checkin_type !== 'weekly' || weekly.coaching_week == null) return null
  const { data, error } = await admin
    .from('checkins')
    .select('*')
    .eq('client_id', weekly.client_id)
    .eq('checkin_type', 'mid_week')
    .eq('coaching_week', weekly.coaching_week)
    .order('submitted_at', { ascending: false })
    .limit(1)
  if (error) {
    console.error('[same-week-midweek] load failed', error.message)
    return null
  }
  const row = (data?.[0] as Checkin | undefined) ?? null
  if (!row || row.id === weekly.id) return null
  return row
}

export function combineCheckinFreeText(
  ...checkins: Array<Checkin | null | undefined>
): string {
  return checkins
    .flatMap((checkin) => [
      checkin?.progress_notes,
      checkin?.notes,
      checkin?.questions_for_coach,
      checkin?.adherence_struggles,
      checkin?.pain_injuries,
      checkin?.digestion,
    ])
    .filter((part): part is string => typeof part === 'string' && Boolean(part.trim()))
    .join('\n')
}
