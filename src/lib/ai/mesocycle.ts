import { formatStickySplitGuidance, formatWorkoutFitGuidance } from '@/lib/ai/workout-split'
import type { OnboardingProfile } from '@/types/database'

/** Mesocycle helpers for monthly volume ramps within a sticky workout split. */

export type MesocycleContext = {
  coachingWeek: number
  weekInMesocycle: 1 | 2 | 3 | 4
  mesocycleIndex: number
  /** Human-readable volume guidance for prompts. */
  volumeGuidance: string
  /** Human-readable calorie guidance paired with volume week. */
  calorieGuidance: string
  /**
   * Week 1 of a mesocycle: refresh exercises + BASE volume within the sticky split.
   * Does NOT mean invent a different split structure.
   */
  isMesocycleWeek1Refresh: boolean
}

const VOLUME_BY_WEEK: Record<1 | 2 | 3 | 4, string> = {
  1: 'Opening week volume follows Workout fit, not a blanket beginner template. Beginners: 3 working sets. Intermediate and advanced: 4 on main lifts. Drop to 2 sets only when this week\'s difficulty is Easier. About 5 to 7 working exercises per session.',
  2: 'BUILD volume: beginners stay at 3 working sets and add load or reps. Intermediate and advanced use 3 to 4 working sets on main compounds and 3 on accessories. Never 5 or more working sets. Do not copy the same lifts onto the next calendar day.',
  3: 'PUSH volume: beginners stay at 3 working sets and add load or tighter reps in reserve. Intermediate and advanced use 4 working sets on main compounds only and 3 on accessories. Never 5 or more working sets.',
  4: 'PEAK volume: keep the week 3 set counts. Progress with load and tighter reps in reserve, not more sets. Beginners stay at 3. Intermediate and advanced stay at 4 on main compounds and 3 on accessories. Never 5 or more working sets.',
}

/** Calorie guidance: hold food flat across weeks unless the coach asks to change it. */
const CALORIE_BY_WEEK: Record<1 | 2 | 3 | 4, string> = {
  1: `BASE calories: HOLD the established daily average (within ~100 kcal) unless CALORIE METHOD gives a new target. Do NOT trim food to match lighter training — reduce volume only. Do NOT raise calories because a new mesocycle started. If fat loss is the goal, raise step targets instead. Do not replace the computed target with an 1800 floor.`,
  2: 'BUILD calories: HOLD the same daily average as last week (within ~100 kcal). Progress training via load/reps/RIR only — do NOT bump food with volume unless the coach specifically asks to raise calories.',
  3: 'PUSH calories: HOLD the same daily average as last week (within ~100 kcal). Intensity up via load/reps/RIR only — do NOT raise calories unless the coach specifically asks.',
  4: 'PEAK calories: HOLD the same daily average as last week (within ~100 kcal). Peak via training intensity only — do NOT raise food for peak week unless the coach specifically asks. Next mesocycle week 1 also keeps calories flat.',
}

/**
 * Coaching week 1 → mesocycle 1 week 1.
 * After every 4 weeks: new mesocycle, week 1 = exercise refresh + BASE volume (same sticky split).
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
    isMesocycleWeek1Refresh: weekInMesocycle === 1,
  }
}

/** Truncate prior workout text so the model can refresh exercises within the sticky split. */
export function summarizePriorSplit(workoutPlan: string | null | undefined, maxLen = 900): string {
  const text = workoutPlan?.trim()
  if (!text) {
    return 'No prior workout on file — use the sticky-split default for this client (full body, upper/lower, or PPL).'
  }
  if (text.length <= maxLen) return text
  return `${text.slice(0, maxLen)}…`
}

export function formatMesocyclePromptSection(
  meso: MesocycleContext,
  priorSplitSummary: string,
  stickySplitGuidance?: string
): string {
  return [
    '## Training Mesocycle (authoritative — obey this)',
    'INTERNAL ONLY: use the week/volume/calorie targets below for programming. NEVER write coaching week numbers, "Welcome to week N", or "next week\'s plan" in client-facing diet or workout text.',
    `- Coaching week: ${meso.coachingWeek}`,
    `- Mesocycle (month index): ${meso.mesocycleIndex}`,
    `- Week within mesocycle: ${meso.weekInMesocycle} of 4`,
    `- Volume target: ${meso.volumeGuidance}`,
    `- Calorie target (hold flat unless coach asks): ${meso.calorieGuidance}`,
    meso.isMesocycleWeek1Refresh
      ? `- Split rule: KEEP the sticky split. New month week 1 = refresh exercises within that same day structure. Volume follows Workout fit (experienced lifters are not given a 2-set week). Do NOT invent a different split template. HOLD calories unless CALORIE METHOD gives a new target — raise steps/cardio if fat loss is the goal. Do not replace that target with an 1800 floor.`
      : '- Split rule: KEEP the sticky split. Progress with the volume target for this week (load, reps, reps in reserve, and the allowed set count). HOLD calories flat. Do not invent a new split.',
    '- Cycle rule: week 1 follows Workout fit. Weeks 2 to 4 progress from that (beginners stay at 3 sets; intermediate and advanced may use 4 on main compounds, or 4 to 5 only when difficulty is Hard). Never a mixed gym-and-home week. Calories stay flat. Do NOT auto-increase calories week to week. Raise or lower food ONLY when the coach specifically asks. New month still HOLDS calories and raises steps if fat loss needs more output.',
    '',
    stickySplitGuidance?.trim() ||
      formatStickySplitGuidance({}),
    '',
    '### Prior workout (keep this day structure and muscle coverage; swap a lift only for the same pattern)',
    priorSplitSummary,
  ].join('\n')
}

/** Convenience for prompt builders that have profile + active plan. */
export function buildMesocyclePromptBlock(opts: {
  coachingWeek: number | null | undefined
  priorWorkout?: string | null
  profile?: Pick<
    OnboardingProfile,
    'fitness_goal' | 'training_experience' | 'onboarding_data'
  > | null
  checkinSplitPreference?: string | null
  workoutDifficulty?: string | null
}): string {
  const meso = resolveMesocycle(opts.coachingWeek)
  const prior = summarizePriorSplit(opts.priorWorkout)
  const sticky = formatStickySplitGuidance({
    priorWorkout: opts.priorWorkout,
    profile: opts.profile,
    checkinSplitPreference: opts.checkinSplitPreference,
  })
  const fit = formatWorkoutFitGuidance({
    difficulty: opts.workoutDifficulty,
    location: opts.profile?.onboarding_data?.training?.location,
    experience: opts.profile?.training_experience,
  })
  return [formatMesocyclePromptSection(meso, prior, sticky), '', fit].join('\n')
}
