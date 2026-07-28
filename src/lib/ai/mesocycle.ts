/** Mesocycle helpers for monthly split rotation and weeks 1–4 volume ramps. */

export type MesocycleContext = {
  coachingWeek: number
  weekInMesocycle: 1 | 2 | 3 | 4
  mesocycleIndex: number
  /** Human-readable volume guidance for prompts. */
  volumeGuidance: string
  /** Human-readable calorie guidance paired with volume week. */
  calorieGuidance: string
  /** Whether this week should open a brand-new split. */
  requiresNewSplit: boolean
}

const VOLUME_BY_WEEK: Record<1 | 2 | 3 | 4, string> = {
  1: 'BASE volume: lowest of the month. Establish the split, leave 2 to 3 reps in reserve on compounds.',
  2: 'BUILD volume: about 10 to 15 percent above week 1 (add a set or a few reps on main lifts).',
  3: 'PUSH volume: about 10 to 15 percent above week 2. Keep form strict; still leave about 1 to 2 RIR on compounds.',
  4: 'PEAK volume: highest of the month (about 10 to 15 percent above week 3). Hardest productive week before the reset.',
}

/** Calorie guidance paired with mesocycle intensity (food rises with training load). */
const CALORIE_BY_WEEK: Record<1 | 2 | 3 | 4, string> = {
  1: 'BASE calories: after a new split / lower volume reset, reduce calories a little from last month peak (about 5 to 10 percent or 100 to 200 kcal) so intake matches the lighter week. Do not crash cut.',
  2: 'BUILD calories: raise intake slightly with the volume bump (about 50 to 150 kcal or more carbs around training) so recovery keeps up.',
  3: 'PUSH calories: raise again with intensity (another about 50 to 150 kcal vs week 2) favoring carbs/protein around workouts.',
  4: 'PEAK calories: highest food of the month to support peak volume. After this week, next mesocycle week 1 drops volume AND trims calories again.',
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
    calorieGuidance: CALORIE_BY_WEEK[weekInMesocycle],
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
    `- Calorie target (pair with volume): ${meso.calorieGuidance}`,
    meso.requiresNewSplit
      ? '- Split rule: NEW unique split this week (month start / reset). Do not recycle last month\'s day structure. Drop volume to BASE and trim calories a little from last peak.'
      : '- Split rule: KEEP the same split as this mesocycle\'s week 1. Raise volume AND calories together per the week targets.',
    '- Cycle rule: intensity/volume up each week inside the month → calories up with it. New month (new split, lower volume) → calories down a little, then climb again.',
    '',
    '### Prior workout / split hint (rotate away when a new split is required)',
    priorSplitSummary,
  ].join('\n')
}
