import { extractStepCount } from '@/lib/ai/cardio-steps'
import { assessDietFollowsRequest } from '@/lib/ai/diet-update-check'
import { extractPlanDayLabels } from '@/lib/ai/plan-completeness'
import { assessWorkoutStructure } from '@/lib/ai/workout-structure'

/** Working memory for one client's planner chat. */
export const PLANNER_CONTEXT_TOKENS = 128_000
/** Leave room for the system prompt and the planner's next reply. */
export const PLANNER_REPLY_RESERVE_TOKENS = 8_000

export const PLANNER_DECISION_LOG_PROMPT = [
  'You write a decision log the coach can read.',
  'Use only facts from the transcript and the constraints that follow it.',
  'Use these headings, and omit a heading when you have nothing true for it:',
  'Constraints',
  'Foods refused',
  'Schedule',
  'Training days',
  'Last plan that went live',
  'Still open',
  'Do not invent changes, foods, or injuries.',
].join('\n')

export const PLANNER_SECTIONS = ['nutrition', 'workout', 'cardio', 'supplements', 'sleep'] as const
export type PlannerSection = (typeof PLANNER_SECTIONS)[number]

/** Queue rows only store diet, workout, or both. */
export function plannerSectionsToScope(sections: PlannerSection[]): 'diet' | 'workout' | 'both' {
  const diet = sections.some((section) => section === 'nutrition' || section === 'sleep' || section === 'supplements')
  const workout = sections.some((section) => section === 'workout' || section === 'cardio')
  if (diet && workout) return 'both'
  if (workout) return 'workout'
  return 'diet'
}

export type PlannerContextMessage = {
  role: 'coach' | 'assistant' | 'summary' | 'request'
  content: string
  created_at: string
}

const WEEKDAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']

export function estimateTokens(text: string): number {
  const trimmed = text.trim()
  if (!trimmed) return 0
  return Math.ceil(trimmed.length / 4)
}

export function labeledDayCount(text: string): number {
  const labels = extractPlanDayLabels(text)
  const weekdays = WEEKDAYS.filter((day) => labels.includes(day))
  const dayN = labels.filter((label) => /^day\s*\d+$/.test(label))
  return Math.max(weekdays.length, dayN.length)
}

/**
 * When the messages the model would see exceed the budget, fold the older
 * part into one recap and keep the newest messages that still fit.
 * Returns null when the current window already fits.
 */
export function plannerModelWindow<T extends PlannerContextMessage>(
  messages: T[],
  budget = PLANNER_CONTEXT_TOKENS - PLANNER_REPLY_RESERVE_TOKENS
): { fold: T[]; keep: T[] } | null {
  let summaryIndex = -1
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i]?.role === 'summary') {
      summaryIndex = i
      break
    }
  }
  const window = summaryIndex >= 0 ? messages.slice(summaryIndex) : messages.slice()
  const tokens = window.reduce((sum, message) => sum + estimateTokens(message.content), 0)
  if (tokens <= budget) return null

  const keep: T[] = []
  let used = 0
  for (let i = window.length - 1; i >= 0; i -= 1) {
    const message = window[i]
    if (!message) continue
    const cost = estimateTokens(message.content)
    if (keep.length > 0 && used + cost > budget) break
    keep.push(message)
    used += cost
  }
  keep.reverse()
  const fold = window.slice(0, window.length - keep.length)
  if (fold.length === 0) return null
  return { fold, keep }
}

export function summaryTimestamp(firstKeptAt: string): string {
  const ms = Date.parse(firstKeptAt)
  if (!Number.isFinite(ms)) return new Date(0).toISOString()
  return new Date(ms - 1).toISOString()
}

const APPLY_VERB =
  /\b(apply|publish|go ahead|do it|ship it|make the change|update the plan|change the plan|rewrite the plan|remake the plan)\b/i
const DIRECT_CHANGE =
  /\b(update|change|rewrite|remake|switch|drop|remove|raise|lower|add)\b[\s\S]{0,60}\b(plan|diet|workout|cardio|steps|supplement|sleep|protein|calories)\b/i
const QUESTION_LEAD = /^(what if|should we|could we|would it|how about|maybe|thoughts|do you think)\b/i

/** True when the coach's latest message is an instruction to write the plan. */
export function coachAskedToApply(message: string): boolean {
  const text = message.trim()
  if (!text) return false
  if (QUESTION_LEAD.test(text)) return false
  if (/\?\s*$/.test(text) && !APPLY_VERB.test(text)) return false
  return APPLY_VERB.test(text) || DIRECT_CHANGE.test(text)
}

/** Blank, or a placeholder that is not a real limit. */
export function meaningfulConstraint(value: string | null | undefined): string {
  const text = value?.trim() ?? ''
  if (!text) return ''
  if (/^(none|n\/a|na|no|nil|nothing|-)$/i.test(text)) return ''
  return text
}

/**
 * PASS means the draft respects the constraints.
 * Anything else is a failure. An empty reply fails closed.
 */
export function parseConstraintFailures(raw: string): string[] {
  const text = raw.trim()
  if (!text) return ['The plan check did not return a result.']
  if (/^pass\b/i.test(text)) return []
  const lines = text
    .split('\n')
    .map((line) => line.replace(/^[-*•]\s*/, '').trim())
    .filter((line) => line.length > 0 && !/^pass$/i.test(line))
  return lines.length > 0 ? lines.slice(0, 6) : ['The plan check did not pass.']
}

export function formatPlannerCheckinBrief(input: {
  checkinId: string
  coachingWeek: number | null
  weight: number | null
  dietAdherence: number | null
  workoutAdherence: number | null
  energyLevel: number | null
  sleepQuality: number | null
  stressLevel: number | null
  painInjuries: string | null
  questions: string | null
}): string {
  const lines = [`Weekly check-in ${input.checkinId}`]
  if (input.coachingWeek) lines.push(`Week ${input.coachingWeek}`)
  if (input.weight != null) lines.push(`Weight: ${input.weight}`)
  if (input.dietAdherence != null) lines.push(`Diet adherence: ${input.dietAdherence}/10`)
  if (input.workoutAdherence != null) lines.push(`Workout adherence: ${input.workoutAdherence}/10`)
  if (input.energyLevel != null) lines.push(`Energy: ${input.energyLevel}/10`)
  if (input.sleepQuality != null) lines.push(`Sleep quality: ${input.sleepQuality}/10`)
  if (input.stressLevel != null) lines.push(`Stress: ${input.stressLevel}/10`)
  const pain = input.painInjuries?.trim()
  if (pain) lines.push(`Pain or injuries: ${pain}`)
  const questions = input.questions?.trim()
  if (questions) lines.push(`Questions: ${questions}`)
  lines.push('This is context for the coach. Do not change the plan until the coach tells you to apply an update.')
  return lines.join('\n')
}

export function checkinBriefMarker(checkinId: string): string {
  return `Weekly check-in ${checkinId}`
}

export function formatPlannerMidWeekBrief(input: {
  checkinId: string
  coachingWeek: number | null
  dietAdherence: number | null
  workoutAdherence: number | null
  energyLevel: number | null
  sleepQuality: number | null
  stressLevel: number | null
  wins: string | null
  struggles: string | null
  painInjuries: string | null
  questions: string | null
}): string {
  const lines = [`Mid-week check-in ${input.checkinId}`]
  if (input.coachingWeek) lines.push(`Week ${input.coachingWeek} Day 3`)
  if (input.dietAdherence != null) lines.push(`Diet adherence: ${input.dietAdherence}/10`)
  if (input.workoutAdherence != null) lines.push(`Workout adherence: ${input.workoutAdherence}/10`)
  if (input.energyLevel != null) lines.push(`Energy: ${input.energyLevel}/10`)
  if (input.sleepQuality != null) lines.push(`Sleep quality: ${input.sleepQuality}/10`)
  if (input.stressLevel != null) lines.push(`Stress: ${input.stressLevel}/10`)
  const wins = input.wins?.trim()
  if (wins) lines.push(`Wins: ${wins}`)
  const struggles = input.struggles?.trim()
  if (struggles) lines.push(`Struggles: ${struggles}`)
  const pain = input.painInjuries?.trim()
  if (pain) lines.push(`Pain or injuries: ${pain}`)
  const questions = input.questions?.trim()
  if (questions) lines.push(`Questions: ${questions}`)
  lines.push(
    'Use this with the Sunday weekly check-in for next week\'s plan. Do not send the client a mid-week reply.'
  )
  return lines.join('\n')
}

export function midWeekBriefMarker(checkinId: string): string {
  return `Mid-week check-in ${checkinId}`
}

export type PlannerUpdate = {
  sections: PlannerSection[]
  instruction: string
  clientNote: string
}

export type PlannerDecision = {
  reply: string
  update: PlannerUpdate | null
  closeRequest: boolean
}

function isSection(value: unknown): value is PlannerSection {
  return typeof value === 'string' && (PLANNER_SECTIONS as readonly string[]).includes(value)
}

export function parsePlannerDecision(raw: string): PlannerDecision {
  const match = raw.match(/<<<PLANNER\s*([\s\S]*?)\s*>>>/)
  const visible = (match ? raw.slice(0, match.index) : raw).trim()
  if (!match?.[1]) {
    return { reply: visible, update: null, closeRequest: false }
  }
  try {
    const parsed = JSON.parse(match[1]) as Record<string, unknown>
    const closeRequest = parsed.closeRequest === true
    const updateRaw = parsed.update
    if (!updateRaw || typeof updateRaw !== 'object') {
      return { reply: visible || 'Noted.', update: null, closeRequest }
    }
    const row = updateRaw as Record<string, unknown>
    const sections = Array.isArray(row.sections) ? row.sections.filter(isSection) : []
    const instruction = typeof row.instruction === 'string' ? row.instruction.trim() : ''
    const clientNote = typeof row.clientNote === 'string' ? row.clientNote.trim().slice(0, 500) : ''
    if (sections.length === 0 || instruction.length < 5) {
      return { reply: visible || 'Tell me which part of the plan to change.', update: null, closeRequest }
    }
    return {
      reply: visible || 'Updating the plan.',
      update: { sections, instruction, clientNote },
      closeRequest,
    }
  } catch {
    return {
      reply: visible || 'I could not read the plan update. Say it again in one message.',
      update: null,
      closeRequest: false,
    }
  }
}

/** True when a blank section is an intentional removal. */
export function clearedSectionOk(text: string, instruction: string): boolean {
  if (text.trim()) return true
  return /\b(remove|drop|stop|none|no cardio|no supplements|clear|without)\b/i.test(instruction)
}

export function crosscheckPlannerSections(input: {
  nutrition: string
  workout: string
  cardio: string
  supplements: string
  sleep?: string
  previousWorkoutDays: number
  previousWorkout?: string | null
  previousNutrition?: string | null
  changed: PlannerSection[]
  instruction: string
}): string[] {
  const errors: string[] = []
  if (input.changed.includes('nutrition')) {
    const got = labeledDayCount(input.nutrition)
    if (got < 7) {
      errors.push(`Diet plan is incomplete: need all 7 days labeled Day 1 (Monday) through Day 7 (Sunday). Found ${got}.`)
    }
    const dietMiss = assessDietFollowsRequest(
      input.nutrition,
      input.instruction,
      input.previousNutrition
    )
    if (dietMiss) errors.push(dietMiss)
  }
  if (input.changed.includes('workout')) {
    const need = Math.max(input.previousWorkoutDays, 1)
    const got = labeledDayCount(input.workout)
    if (got < need) {
      errors.push(`Workout plan is incomplete: need ${need} labeled training day${need === 1 ? '' : 's'}. Found ${got}.`)
    }
    errors.push(...assessWorkoutStructure(input.workout, input.previousWorkout, input.instruction))
  }
  if (input.changed.includes('cardio') && extractStepCount(input.cardio) == null) {
    errors.push('Cardio plan must be a daily step count, such as 8000 steps.')
  }
  if (input.changed.includes('supplements') && !clearedSectionOk(input.supplements, input.instruction)) {
    errors.push('Supplement plan came back empty.')
  }
  if (input.changed.includes('sleep')) {
    const sleep = input.sleep ?? ''
    if (!/sleep/i.test(sleep) || !/\d+(?:\.\d+)?\s*(?:hours?|hrs?)/i.test(sleep)) {
      errors.push('Sleep guidance must say how many hours to sleep.')
    }
  }
  return errors
}
