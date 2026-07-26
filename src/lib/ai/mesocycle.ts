/** Mesocycle helpers for monthly split rotation and weeks 1–4 volume ramps. */

export type MesocycleContext = {
  coachingWeek: number
  weekInMesocycle: 1 | 2 | 3 | 4
  mesocycleIndex: number
  /** Human-readable volume guidance for prompts. */
  volumeGuidance: string
  /** Human-readable calorie wave guidance paired with the training load. */
  calorieGuidance: string
  /** Deterministic adjustment from the cycle's base intake. */
  calorieAdjustmentKcal: number
  /** Whether this week should open a brand-new split. */
  requiresNewSplit: boolean
}

const VOLUME_BY_WEEK: Record<1 | 2 | 3 | 4, string> = {
  1: 'BASE volume, the lowest of the cycle. Establish the split and leave 2 to 3 reps in reserve on compounds.',
  2: 'BUILD volume, about 10 to 15 percent above the prior week by adding a set or a few reps on main lifts.',
  3: 'PUSH volume, about 10 to 15 percent above the prior week. Keep form strict and leave 1 to 2 reps in reserve on compounds.',
  4: 'PEAK volume, the highest of the cycle and about 10 to 15 percent above the prior week.',
}

const CALORIES_BY_WEEK: Record<1 | 2 | 3 | 4, string> = {
  1: 'BASE calorie intake. At a new cycle reset, reduce average daily intake by about 100 to 200 kcal from the prior peak because the new split starts at lower volume. In the opening cycle, use the calculated goal appropriate baseline.',
  2: 'Increase average daily intake by about 50 to 100 kcal above the prior week to support the higher training workload.',
  3: 'Increase average daily intake by another 50 to 100 kcal above the prior week, mainly through carbohydrates around training.',
  4: 'Increase average daily intake by another 50 to 100 kcal above the prior week for peak workload, while staying inside the goal appropriate calorie band.',
}

const CALORIE_ADJUSTMENT_BY_WEEK: Record<1 | 2 | 3 | 4, number> = {
  1: 0,
  2: 60,
  3: 120,
  4: 180,
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
    calorieGuidance: CALORIES_BY_WEEK[weekInMesocycle],
    calorieAdjustmentKcal: CALORIE_ADJUSTMENT_BY_WEEK[weekInMesocycle],
    requiresNewSplit: weekInMesocycle === 1,
  }
}

/** Truncate prior workout text so the model can rotate away from the last split. */
export function summarizePriorSplit(workoutPlan: string | null | undefined, maxLen = 900): string {
  const text = workoutPlan?.trim()
  if (!text) return 'No prior workout on file. Invent a fresh opening split.'
  if (text.length <= maxLen) return text
  return `${text.slice(0, maxLen)}…`
}

export function formatMesocyclePromptSection(
  meso: MesocycleContext,
  priorSplitSummary: string
): string {
  return [
    '## Training Mesocycle and Calorie Wave',
    `Coaching week: ${meso.coachingWeek}`,
    `Mesocycle index: ${meso.mesocycleIndex}`,
    `Position in cycle: ${meso.weekInMesocycle} of 4`,
    `Volume target: ${meso.volumeGuidance}`,
    `Calorie target: ${meso.calorieGuidance}`,
    'Calorie safety rule: keep the wave inside the goal appropriate Metabolic Flux band. Preserve protein and adjust mostly carbohydrates. Check in safety signals may require holding the increase.',
    meso.requiresNewSplit
      ? 'Split rule: Create a new unique split this cycle. Do not recycle the prior cycle day structure.'
      : 'Split rule: Keep the same split established at the start of this cycle. Progress workload according to the volume target.',
    '',
    '### Prior workout and split context',
    priorSplitSummary,
  ].join('\n')
}
