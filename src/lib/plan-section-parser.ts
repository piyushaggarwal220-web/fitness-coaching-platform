import { clientCoachNotes } from '@/lib/plan-metadata'
import type { Plan, PlanFormData } from '@/types/database'

export type ParsedPlanSections = {
  diet: string
  workout: string
  supplements: string
  cardio: string
  coachNotes: string
}

type SectionKey = keyof ParsedPlanSections

const SECTION_ORDER: SectionKey[] = ['diet', 'workout', 'supplements', 'cardio', 'coachNotes']

const HEADER_PATTERNS: { key: SectionKey; regex: RegExp }[] = [
  { key: 'diet', regex: /^(?:#{1,3}\s*)?(?:daily\s+)?(?:diet|nutrition|meal\s*plan|meals|food\s*plan)\s*:?\s*$/i },
  { key: 'workout', regex: /^(?:#{1,3}\s*)?(?:workout|training|exercise(?:\s*plan)?|strength\s*program)\s*:?\s*$/i },
  { key: 'supplements', regex: /^(?:#{1,3}\s*)?(?:supplements?|supplementation)\s*:?\s*$/i },
  { key: 'cardio', regex: /^(?:#{1,3}\s*)?(?:cardio|cardiovascular|conditioning|steps)\s*:?\s*$/i },
  { key: 'coachNotes', regex: /^(?:#{1,3}\s*)?(?:coach\s*notes?|coaching\s*notes?|notes|lifestyle)\s*:?\s*$/i },
]

function normalizeText(value: string | null | undefined): string {
  return value?.trim() ?? ''
}

function isMeaningful(value: string): boolean {
  const trimmed = value.trim()
  if (!trimmed) return false
  const placeholders = [
    'not provided',
    'none specified',
    'pending',
    'unchanged this week',
    'workout plan pending',
    'no active',
  ]
  return !placeholders.some((p) => trimmed.toLowerCase() === p)
}

function matchHeaderLine(trimmed: string): SectionKey | null {
  const cleaned = trimmed
    .replace(/^\*{1,2}\s*/, '')
    .replace(/\s*\*{1,2}$/, '')
    .replace(/^_{1,2}\s*/, '')
    .replace(/\s*_{1,2}$/, '')
    .trim()

  for (const { key, regex } of HEADER_PATTERNS) {
    if (regex.test(cleaned) || regex.test(trimmed)) return key
  }

  const inline = cleaned.match(
    /^(?:.*?:\s*)?(diet|nutrition|meal\s*plan|workout|training|supplements?|cardio|coach\s*notes?)\s*:?\s*$/i
  )
  if (!inline) return null
  const label = inline[1].toLowerCase()
  if (label.includes('diet') || label.includes('nutrition') || label.includes('meal')) return 'diet'
  if (label.includes('workout') || label.includes('training')) return 'workout'
  if (label.includes('supplement')) return 'supplements'
  if (label.includes('cardio')) return 'cardio'
  return 'coachNotes'
}

/** Peel trailing Cardio:/Supplements: blocks even when they are not standalone headers. */
function stripInlineSectionBlocks(text: string, keysToRemove: SectionKey[]): string {
  if (!text.trim() || keysToRemove.length === 0) return text.trim()

  const patterns: Partial<Record<SectionKey, RegExp>> = {
    cardio:
      /(?:^|\n)\s*(?:\*{0,2}|#{1,3}\s*)?(?:cardio(?:\s*(?:plan|this\s+week))?|conditioning|steps)\s*:?\s*\*{0,2}\s*(?:\n|[\t ]*).*/gi,
    supplements:
      /(?:^|\n)\s*(?:\*{0,2}|#{1,3}\s*)?supplements?(?:\s*plan)?\s*:?\s*\*{0,2}\s*(?:\n|[\t ]*).*/gi,
    coachNotes:
      /(?:^|\n)\s*(?:\*{0,2}|#{1,3}\s*)?(?:coach\s*notes?|coaching\s*notes?)\s*:?\s*\*{0,2}\s*(?:\n|[\t ]*).*/gi,
  }

  let result = text
  for (const key of keysToRemove) {
    const pattern = patterns[key]
    if (pattern) result = result.replace(pattern, '\n')
  }
  return result.replace(/\n{3,}/g, '\n\n').trim()
}

/** Split prose on known section headers (case-insensitive, markdown-tolerant). */
export function splitPlanTextByHeaders(text: string): Partial<Record<SectionKey, string>> {
  const input = text.replace(/\r\n/g, '\n').trim()
  if (!input) return {}

  const lines = input.split('\n')
  const sections: Partial<Record<SectionKey, string>> = {}
  let currentKey: SectionKey | null = null
  const buffers: Record<SectionKey, string[]> = {
    diet: [],
    workout: [],
    supplements: [],
    cardio: [],
    coachNotes: [],
  }
  const preamble: string[] = []

  const flush = () => {
    if (!currentKey) return
    const body = buffers[currentKey].join('\n').trim()
    if (body) {
      const existing = sections[currentKey]?.trim()
      sections[currentKey] = existing ? `${existing}\n\n${body}` : body
    }
    buffers[currentKey] = []
  }

  for (const line of lines) {
    const trimmed = line.trim()
    const headerKey = matchHeaderLine(trimmed)
    if (headerKey) {
      flush()
      currentKey = headerKey
      continue
    }
    if (currentKey) {
      buffers[currentKey].push(line)
    } else {
      preamble.push(line)
    }
  }

  flush()

  const preambleText = preamble.join('\n').trim()
  if (preambleText) {
    if (sections.diet) {
      sections.diet = `${preambleText}\n\n${sections.diet}`.trim()
    } else {
      sections.diet = preambleText
    }
  }

  return sections
}

function pickSection(
  explicit: string,
  ...embeddedSources: string[]
): string {
  if (isMeaningful(explicit)) return explicit.trim()

  for (const source of embeddedSources) {
    if (isMeaningful(source)) return source.trim()
  }
  return ''
}

function stripEmbeddedSections(text: string, keysToRemove: SectionKey[]): string {
  const parsed = splitPlanTextByHeaders(text)
  if (Object.keys(parsed).length <= 1) return text.trim()

  const remaining = SECTION_ORDER.filter((key) => !keysToRemove.includes(key))
    .map((key) => parsed[key])
    .filter((v) => isMeaningful(v ?? ''))
    .join('\n\n')

  return remaining.trim() || text.trim()
}

/**
 * Resolve plan content into five display/storage sections without losing information.
 * Prefers explicit DB fields; parses embedded headers from combined diet/workout text.
 */
export function resolvePlanSections(input: {
  nutrition_plan?: string | null
  workout_plan?: string | null
  supplement_plan?: string | null
  cardio_plan?: string | null
  coach_notes?: string | null
}): ParsedPlanSections {
  const nutrition = normalizeText(input.nutrition_plan)
  const workout = normalizeText(input.workout_plan)
  const supplementsExplicit = normalizeText(input.supplement_plan)
  const cardioExplicit = normalizeText(input.cardio_plan)
  const notesExplicit = clientCoachNotes(normalizeText(input.coach_notes))

  const fromNutrition = splitPlanTextByHeaders(nutrition)
  const fromWorkout = splitPlanTextByHeaders(workout)

  const coachNotes = pickSection(
    notesExplicit,
    fromNutrition.coachNotes ?? '',
    fromWorkout.coachNotes ?? ''
  )

  let diet = pickSection(
    nutrition,
    fromNutrition.diet ?? ''
  )
  if (fromNutrition.supplements || fromNutrition.cardio || fromNutrition.coachNotes) {
    diet = stripEmbeddedSections(nutrition, ['supplements', 'cardio', 'coachNotes'])
  }
  diet = stripInlineSectionBlocks(diet, ['supplements', 'cardio', 'coachNotes'])

  let workoutText = pickSection(
    workout,
    fromWorkout.workout ?? ''
  )
  if (fromWorkout.cardio || fromWorkout.coachNotes || fromWorkout.supplements) {
    workoutText = stripEmbeddedSections(workout, ['cardio', 'coachNotes', 'supplements'])
  }
  workoutText = stripInlineSectionBlocks(workoutText, ['cardio', 'coachNotes', 'supplements'])

  const cardio = pickSection(
    cardioExplicit,
    fromNutrition.cardio ?? '',
    fromWorkout.cardio ?? '',
    extractInlineSection(nutrition, 'cardio'),
    extractInlineSection(workout, 'cardio')
  )
  const supplements = pickSection(
    supplementsExplicit,
    fromNutrition.supplements ?? '',
    fromWorkout.supplements ?? '',
    extractInlineSection(nutrition, 'supplements'),
    extractInlineSection(workout, 'supplements')
  )

  if (!isMeaningful(diet) && isMeaningful(nutrition) && !fromNutrition.supplements && !fromNutrition.cardio) {
    diet = stripInlineSectionBlocks(nutrition, ['supplements', 'cardio', 'coachNotes'])
  }
  if (!isMeaningful(workoutText) && isMeaningful(workout) && !fromWorkout.cardio && !fromWorkout.coachNotes) {
    workoutText = stripInlineSectionBlocks(workout, ['cardio', 'coachNotes', 'supplements'])
  }

  return {
    diet: diet.trim(),
    workout: workoutText.trim(),
    supplements: supplements.trim(),
    cardio: cardio.trim(),
    coachNotes: coachNotes.trim(),
  }
}

function extractInlineSection(text: string, key: 'cardio' | 'supplements'): string {
  if (!text.trim()) return ''
  const pattern =
    key === 'cardio'
      ? /(?:^|\n)\s*(?:\*{0,2}|#{1,3}\s*)?(?:cardio(?:\s*(?:plan|this\s+week))?|conditioning|steps)\s*:?\s*\*{0,2}\s*([\s\S]*?)(?=(?:\n\s*(?:\*{0,2}|#{1,3}\s*)?(?:diet|nutrition|workout|training|supplements?|coach\s*notes?)\b)|\s*$)/i
      : /(?:^|\n)\s*(?:\*{0,2}|#{1,3}\s*)?supplements?(?:\s*plan)?\s*:?\s*\*{0,2}\s*([\s\S]*?)(?=(?:\n\s*(?:\*{0,2}|#{1,3}\s*)?(?:diet|nutrition|workout|training|cardio|coach\s*notes?)\b)|\s*$)/i
  const match = text.match(pattern)
  return match?.[1]?.trim() ?? ''
}

export function resolvePlanSectionsFromPlan(plan: Plan | PlanFormData): ParsedPlanSections {
  return resolvePlanSections({
    nutrition_plan: plan.nutrition_plan,
    workout_plan: plan.workout_plan,
    supplement_plan: plan.supplement_plan,
    cardio_plan: plan.cardio_plan,
    coach_notes: plan.coach_notes,
  })
}

/** Apply parsed sections back onto plan form data (for saving after AI generation). */
export function applyParsedSectionsToFormData(form: PlanFormData): PlanFormData {
  const parsed = resolvePlanSections(form)
  return {
    ...form,
    nutrition_plan: parsed.diet,
    workout_plan: parsed.workout,
    supplement_plan: parsed.supplements,
    cardio_plan: parsed.cardio,
    coach_notes: parsed.coachNotes,
  }
}
