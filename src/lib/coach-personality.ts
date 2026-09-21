export const COACH_PERSONALITY_IDS = [
  'strict',
  'supportive',
  'pushy',
  'calm',
  'tough_love',
  'direct',
] as const

export type CoachPersonalityId = (typeof COACH_PERSONALITY_IDS)[number]

export const COACH_PERSONALITY_META: Record<
  CoachPersonalityId,
  { label: string; description: string; directive: string }
> = {
  strict: {
    label: 'Strict',
    description: 'Clear rules, little waffle, holds you to the plan.',
    directive: 'Be strict: set clear expectations, call out skipped work firmly but fairly.',
  },
  supportive: {
    label: 'Supportive',
    description: 'Warm encouragement and patience when life gets messy.',
    directive: 'Be supportive: encourage progress, acknowledge effort, stay patient.',
  },
  pushy: {
    label: 'Pushy',
    description: 'High energy — nudges you to do more when you stall.',
    directive: 'Be pushy: urge action, raise the bar slightly, keep momentum high.',
  },
  calm: {
    label: 'Calm',
    description: 'Steady, low-pressure guidance without hype.',
    directive: 'Be calm: steady tone, no hype, keep advice simple and grounded.',
  },
  tough_love: {
    label: 'Tough love',
    description: 'Honest feedback with care — no sugarcoating.',
    directive: 'Use tough love: honest about gaps, still show you care about results.',
  },
  direct: {
    label: 'Direct',
    description: 'Short answers, concrete next steps, no fluff.',
    directive: 'Be direct: short sentences, concrete next steps, no fluff.',
  },
}

export const COACH_PERSONALITY_MIN = 1
export const COACH_PERSONALITY_MAX = 3

export function isCoachPersonalityId(value: string | null | undefined): value is CoachPersonalityId {
  return Boolean(value && (COACH_PERSONALITY_IDS as readonly string[]).includes(value))
}

export function normalizeCoachPersonalities(
  values: string[] | null | undefined
): CoachPersonalityId[] {
  if (!values?.length) return []
  const unique: CoachPersonalityId[] = []
  for (const value of values) {
    if (!isCoachPersonalityId(value)) continue
    if (unique.includes(value)) continue
    unique.push(value)
    if (unique.length >= COACH_PERSONALITY_MAX) break
  }
  return unique
}

export function validateCoachPersonalities(values: string[] | null | undefined): string | null {
  const normalized = normalizeCoachPersonalities(values)
  if (normalized.length < COACH_PERSONALITY_MIN) {
    return `Pick at least ${COACH_PERSONALITY_MIN} coaching style.`
  }
  if ((values?.length ?? 0) > COACH_PERSONALITY_MAX) {
    return `Pick up to ${COACH_PERSONALITY_MAX} styles.`
  }
  if (normalized.length !== new Set(values ?? []).size && (values?.length ?? 0) > 0) {
    const unknown = (values ?? []).filter((v) => !isCoachPersonalityId(v))
    if (unknown.length > 0) return 'Pick valid coaching styles from the list.'
  }
  return null
}

/** Inject into AI system prompts so replies match the client's chosen styles. */
export function formatCoachPersonalityDirective(
  personalities: string[] | null | undefined
): string {
  const normalized = normalizeCoachPersonalities(personalities)
  if (normalized.length === 0) {
    return 'Coaching tone: supportive and direct. Keep replies short and India-friendly English.'
  }
  const lines = normalized.map((id) => `- ${COACH_PERSONALITY_META[id].directive}`)
  return [
    'Client-selected coaching styles (blend these; do not name the style labels):',
    ...lines,
    'Keep replies short, practical, and India-friendly English. No medical advice.',
  ].join('\n')
}

export function formatCoachPersonalityLabels(
  personalities: string[] | null | undefined
): string {
  const normalized = normalizeCoachPersonalities(personalities)
  if (normalized.length === 0) return 'Not set'
  return normalized.map((id) => COACH_PERSONALITY_META[id].label).join(', ')
}
