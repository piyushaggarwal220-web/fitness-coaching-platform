/** Mesocycle helpers for monthly split rotation and weeks 1–4 volume ramps. */

export type MesocycleContext = {
  coachingWeek: number
  weekInMesocycle: 1 | 2 | 3 | 4
  mesocycleIndex: number
  /** Human-readable volume guidance for prompts. */
  volumeGuidance: string
  /** Whether this week should open a brand-new split. */
  requiresNewSplit: boolean
}

const VOLUME_BY_WEEK: Record<1 | 2 | 3 | 4, string> = {
  1: 'BASE volume — lowest of the month. Establish the split, leave 2–3 reps in reserve on compounds.',
  2: 'BUILD volume — ~10–15% above week 1 (add a set or a few reps on main lifts).',
  3: 'PUSH volume — ~10–15% above week 2. Keep form strict; still leave ~1–2 RIR on compounds.',
  4: 'PEAK volume — highest of the month (~10–15% above week 3). Hardest productive week before the reset.',
}

/**
 * Coaching week 1 → mesocycle 1 week 1.
 * After every 4 weeks: new mesocycle, week 1, new split + volume reset.
 */
export function resolveMesocycle(coachingWeek: number | null | undefined): MesocycleContext {
  const week = Math.max(1, Math.floor(Number(coachingWeek) || 1))
  const weekInMesocycle = ((((week - 1) % 4) + 4) % 4) + 1 as 1 | 2 | 3 | 4
  const mesocycleIndex = Math.floor((week - 1) / 4) + 1
  return {
    coachingWeek: week,
    weekInMesocycle,
    mesocycleIndex,
    volumeGuidance: VOLUME_BY_WEEK[weekInMesocycle],
    requiresNewSplit: weekInMesocycle === 1,
  }
}

/** Truncate prior workout text so the model can rotate away from the last split. */
export function summarizePriorSplit(workoutPlan: string | null | undefined, maxLen = 900): string {
  const text = workoutPlan?.trim()
  if (!text) return 'No prior workout on file — invent a fresh opening split.'
  if (text.length <= maxLen) return text
  return `${text.slice(0, maxLen)}…`
}

export function formatMesocyclePromptSection(
  meso: MesocycleContext,
  priorSplitSummary: string
): string {
  return [
    '## Training Mesocycle (authoritative — obey this)',
    `- Coaching week: ${meso.coachingWeek}`,
    `- Mesocycle (month index): ${meso.mesocycleIndex}`,
    `- Week within mesocycle: ${meso.weekInMesocycle} of 4`,
    `- Volume target: ${meso.volumeGuidance}`,
    meso.requiresNewSplit
      ? '- Split rule: NEW unique split this week (month start / reset). Do not recycle last month\'s day structure.'
      : '- Split rule: KEEP the same split as this mesocycle\'s week 1. Only progress volume/load per the week target.',
    '',
    '### Prior workout / split hint (rotate away when a new split is required)',
    priorSplitSummary,
  ].join('\n')
}
