/**
 * Cardio plans are a single daily step target — no LISS/HIIT/session prose.
 * Tracker parses "N steps"; keep that as the only client-facing line.
 */

const STEP_COUNT_RE = /\b(\d{1,2}(?:[,.\s]?\d{3})|\d{4,5})\s*(?:k\s*)?steps?\b/i
const STEPS_THEN_NUMBER_RE = /steps?\s*(?:target|to|:)?\s*(\d{1,2}(?:[,.\s]?\d{3})|\d{4,5})\b/i
const SHORT_K_STEPS_RE = /\b(\d{1,2})\s*k\s*steps?\b/i
const BARE_STEP_NUMBER_RE = /^\s*(\d{4,5})\s*$/

export const CARDIO_STEPS_ONLY_RULES = [
  'CARDIO PLAN (non-negotiable):',
  'Write ONLY the daily step count. One line. Nothing else.',
  'Correct: "8000 steps"',
  'Do not write LISS, HIIT, walks with duration, water, sleep, frequency, or coaching commentary.',
  'Do not use Markdown, bullets, or extra sentences.',
  'Put that single line in cardio_plan.sessions as one item, e.g. { "type": "8000 steps" } or { "steps": 8000 }.',
].join('\n')

export function extractStepCount(text: string | null | undefined): number | null {
  if (!text?.trim()) return null
  const kMatch = text.match(SHORT_K_STEPS_RE)
  if (kMatch) {
    const n = parseInt(kMatch[1]!, 10)
    if (Number.isFinite(n) && n >= 2 && n <= 25) return n * 1000
  }
  const match = text.match(STEP_COUNT_RE) ?? text.match(STEPS_THEN_NUMBER_RE)
  if (match) {
    const n = parseInt(match[1]!.replace(/[,\s.]/g, ''), 10)
    if (Number.isFinite(n) && n >= 2000 && n <= 30000) return n
  }
  const bare = text.match(BARE_STEP_NUMBER_RE)
  if (bare) {
    const n = parseInt(bare[1]!, 10)
    if (Number.isFinite(n) && n >= 2000 && n <= 30000) return n
  }
  return null
}

/** Habit band from onboarding → a concrete daily target. */
export function defaultDailyStepTarget(habit: string | null | undefined): number {
  const raw = String(habit ?? '').trim().toLowerCase()
  if (!raw) return 8000
  if (raw === 'under_3000' || raw.includes('under')) return 7000
  if (raw === '3000_6000') return 8000
  if (raw === '6000_10000') return 10000
  if (raw === 'over_10000' || raw.startsWith('over') || raw.endsWith('+')) return 12000
  const n = parseInt(raw.replace(/[^\d]/g, ''), 10)
  if (Number.isFinite(n) && n >= 1000 && n <= 25000) {
    return Math.min(15000, Math.max(6000, n + 2000))
  }
  return 8000
}

export function formatStepsOnlyCardio(steps: number): string {
  const rounded = Math.round(steps / 500) * 500
  const clamped = Math.min(25000, Math.max(3000, rounded))
  return `${clamped} steps`
}

export function isStepsOnlyCardioPlan(text: string | null | undefined): boolean {
  const lines = (text ?? '')
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
  if (lines.length !== 1) return false
  return extractStepCount(lines[0]) != null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function stepCountFromUnknown(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 2000 && value <= 30000) {
    return Math.round(value)
  }
  if (typeof value === 'string') return extractStepCount(value)
  if (isRecord(value)) {
    for (const key of ['steps', 'target', 'daily_steps', 'dailySteps', 'type', 'name', 'notes', 'duration']) {
      const found = stepCountFromUnknown(value[key])
      if (found != null) return found
    }
    return extractStepCount(JSON.stringify(value))
  }
  return null
}

/** Collapse any AI cardio payload into the single client-facing line. */
export function normalizeCardioPlanToSteps(
  sessions: unknown[] | string | null | undefined,
  fallbackHabit?: string | null,
  fallbackText?: string | null
): string {
  const fallback = extractStepCount(fallbackText) ?? defaultDailyStepTarget(fallbackHabit)
  if (typeof sessions === 'string') {
    return formatStepsOnlyCardio(extractStepCount(sessions) ?? fallback)
  }
  if (!Array.isArray(sessions) || sessions.length === 0) {
    return formatStepsOnlyCardio(fallback)
  }
  let best: number | null = null
  for (const session of sessions) {
    const n = stepCountFromUnknown(session)
    if (n != null) best = best == null ? n : Math.max(best, n)
  }
  return formatStepsOnlyCardio(best ?? fallback)
}

export function stepCountFromInstruction(instruction: string | null | undefined): number | null {
  return extractStepCount(instruction)
}
