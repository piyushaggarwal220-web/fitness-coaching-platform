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
  1: 'BASE volume: lowest of the month. 2 to 3 working sets per exercise, about 5 to 7 working exercises per session. Leave 2 to 3 reps in reserve on compounds. Do not stack extra sets.',
  2: 'BUILD volume: progress via load or a few extra reps on main lifts, not extra working sets. Stay at 2 to 3 sets (4 only on one main compound). Never 5+ sets.',
  3: 'PUSH volume: add load or tighter RIR, not junk sets. Still 2 to 3 working sets per exercise.',
  4: 'PEAK volume: hardest productive week via load, reps, or RIR, still capped at 3 working sets (4 on one compound). Never 5+ sets.',
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
    'INTERNAL ONLY: use the week/volume/calorie targets below for programming. NEVER write coaching week numbers, "Welcome to week N", or "next week\'s plan" in client-facing diet or workout text.',
    `- Coaching week: ${meso.coachingWeek}`,
    `- Mesocycle (month index): ${meso.mesocycleIndex}`,
    `- Week within mesocycle: ${meso.weekInMesocycle} of 4`,
    `- Volume target: ${meso.volumeGuidance}`,
    `- Calorie target (hold flat unless coach asks): ${meso.calorieGuidance}`,
    meso.requiresNewSplit
      ? `- Split rule: NEW split vs last month. Proven templates (full body, upper/lower, PPL) are valid if they fit this client. Do not recycle last month's day structure. Drop working sets to BASE (2 to 3) and HOLD calories — raise steps/cardio if fat loss is the goal, never below ${DIET_FLOOR_BASE_KCAL} kcal. Change calories only if the coach specifically asks.`
      : '- Split rule: KEEP the same split as this mesocycle\'s week 1. Progress load/reps/RIR only — HOLD calories flat. Do not add extra working sets or invent a new split.',
    '- Cycle rule: intensity up each week inside the month via load/reps/RIR — calories stay flat. Do NOT auto-increase calories week to week. Raise or lower food ONLY when the coach specifically asks. New month (new split, lower volume) → still HOLD calories and raise output if needed. Never add working sets past the 2 to 3 cap (4 on one compound) just to hit a percent increase.',
    '',
    '### Prior workout / split hint (rotate away when a new split is required)',
    priorSplitSummary,
  ].join('\n')
}
