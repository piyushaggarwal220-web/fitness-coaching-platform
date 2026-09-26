import { DIET_FLOOR_BASE_KCAL } from '@/lib/ai/plan-quality-rules'

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
  1: 'BASE volume: lowest of the month. 2 to 3 working sets per exercise for every experience level, about 5 to 7 working exercises per session. Leave 2 to 3 reps in reserve on compounds.',
  2: 'BUILD volume: beginners stay at 2 to 3 working sets and add load or reps. Intermediate and advanced use 3 working sets on main compounds and 2 to 3 on accessories. Never 5 or more working sets.',
  3: 'PUSH volume: beginners stay at 3 working sets and add load or tighter reps in reserve. Intermediate and advanced use 4 working sets on main compounds only and 3 on accessories. Never 5 or more working sets.',
  4: 'PEAK volume: keep the week 3 set counts. Progress with load and tighter reps in reserve, not more sets. Beginners stay at 3. Intermediate and advanced stay at 4 on main compounds and 3 on accessories. Never 5 or more working sets.',
}

/** Calorie guidance: hold food flat across weeks unless the coach asks to change it. */
const CALORIE_BY_WEEK: Record<1 | 2 | 3 | 4, string> = {
  1: `BASE calories: HOLD the established daily average (within ~100 kcal). Do NOT trim food to match lighter training — reduce volume only. Do NOT raise calories because a new mesocycle started. Change calories only if the coach specifically asks. If fat loss is the goal, raise step targets instead. Never go below ${DIET_FLOOR_BASE_KCAL} kcal.`,
  2: 'BUILD calories: HOLD the same daily average as last week (within ~100 kcal). Progress training via load/reps/RIR only — do NOT bump food with volume unless the coach specifically asks to raise calories.',
  3: 'PUSH calories: HOLD the same daily average as last week (within ~100 kcal). Intensity up via load/reps/RIR only — do NOT raise calories unless the coach specifically asks.',
  4: 'PEAK calories: HOLD the same daily average as last week (within ~100 kcal). Peak via training intensity only — do NOT raise food for peak week unless the coach specifically asks. Next mesocycle week 1 also keeps calories flat.',
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
  if (!text) return 'No prior workout on file — pick a proven split that fits this client (full body, upper/lower, or push/pull/legs).'
  if (text.length <= maxLen) return text
  return `${text.slice(0, maxLen)}…`
}

export function formatMesocyclePromptSection(
  meso: MesocycleContext,
  priorSplitSummary: string
): string {
  return [
    '## Training Mesocycle (authoritative — obey this)',
    'INTERNAL ONLY: use the week/volume/calorie targets below for programming. NEVER write coaching week numbers, "Welcome to week N", or "next week\'s plan" in client-facing diet or workout text.',
    `- Coaching week: ${meso.coachingWeek}`,
    `- Mesocycle (month index): ${meso.mesocycleIndex}`,
    `- Week within mesocycle: ${meso.weekInMesocycle} of 4`,
    `- Volume target: ${meso.volumeGuidance}`,
    `- Calorie target (hold flat unless coach asks): ${meso.calorieGuidance}`,
    meso.requiresNewSplit
      ? `- Split rule: NEW split vs last month. Proven templates (full body, upper/lower, PPL) are valid if they fit this client. Do not recycle last month's day structure. Drop working sets to BASE (2 to 3 for everyone) and HOLD calories — raise steps/cardio if fat loss is the goal, never below ${DIET_FLOOR_BASE_KCAL} kcal. Change calories only if the coach specifically asks.`
      : '- Split rule: KEEP the same split as this mesocycle\'s week 1. Progress with the volume target for this week (load, reps, reps in reserve, and the allowed set count). HOLD calories flat. Do not invent a new split.',
    '- Cycle rule: week 1 is 2 to 3 working sets for everyone. Weeks 2 to 4 follow the volume target (beginners stay lower; intermediate and advanced may reach 4 sets on main compounds). Never 5 or more working sets. Calories stay flat. Do NOT auto-increase calories week to week. Raise or lower food ONLY when the coach specifically asks. New month (new split, base volume) still HOLDS calories and raises steps if fat loss needs more output.',
    '',
    '### Prior workout / split hint (rotate away when a new split is required)',
    priorSplitSummary,
  ].join('\n')
}
