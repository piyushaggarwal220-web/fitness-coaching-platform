import type { OnboardingProfile } from '@/types/database'

/** Proven split templates used across initial + weekly programming. */
export type WorkoutSplitKind = 'ppl' | 'upper_lower' | 'full_body' | 'unknown'

/** Onboarding: system picks, or client names a preferred template. */
export type OnboardingSplitPreference = 'system_decide' | 'ppl' | 'upper_lower' | 'full_body'

/**
 * Weekly check-in:
 * keep = sticky current split
 * change_system = change structure, system decides
 * named split = change to that template
 */
export type CheckinSplitPreference =
  | 'keep'
  | 'change_system'
  | 'ppl'
  | 'upper_lower'
  | 'full_body'

export const ONBOARDING_SPLIT_PREFERENCE_OPTIONS = [
  { value: 'system_decide', label: 'Decide for me (recommended)' },
  { value: 'upper_lower', label: 'Upper / Lower' },
  { value: 'ppl', label: 'Push / Pull / Legs' },
] as const

export const CHECKIN_SPLIT_PREFERENCE_OPTIONS = [
  { value: 'keep', label: 'Keep my current split' },
  { value: 'change_system', label: 'Change it — decide for me' },
  { value: 'upper_lower', label: 'Switch to upper / lower' },
  { value: 'ppl', label: 'Switch to push / pull / legs' },
] as const

/** Sunday check-in and coach input. There is no mixed gym-and-home option. */
export const WORKOUT_DIFFICULTY_OPTIONS = [
  { value: 'keep', label: 'Keep the current difficulty' },
  { value: 'easier', label: 'Easier — fewer sets, more left in the tank' },
  { value: 'moderate', label: 'Moderate — matched to my level' },
  { value: 'hard', label: 'Hard — heavier, fuller sets' },
] as const

export type WorkoutDifficulty = (typeof WORKOUT_DIFFICULTY_OPTIONS)[number]['value']

const SPLIT_LABEL: Record<Exclude<WorkoutSplitKind, 'unknown'>, string> = {
  ppl: 'Push / Pull / Legs (PPL)',
  upper_lower: 'Upper / Lower',
  full_body: 'Full body',
}

const ONBOARDING_PREF_LABEL: Record<OnboardingSplitPreference, string> = {
  system_decide: 'Decide for me',
  ppl: 'Push / Pull / Legs (PPL)',
  upper_lower: 'Upper / Lower',
  full_body: 'Full body',
}

const CHECKIN_PREF_LABEL: Record<CheckinSplitPreference, string> = {
  keep: 'Keep current split',
  change_system: 'Change — decide for me',
  ppl: 'Switch to Push / Pull / Legs',
  upper_lower: 'Switch to Upper / Lower',
  full_body: 'Switch to full body',
}

type ProfileForSplit = Pick<
  OnboardingProfile,
  'fitness_goal' | 'training_experience' | 'onboarding_data'
>

export function splitKindLabel(kind: Exclude<WorkoutSplitKind, 'unknown'>): string {
  return SPLIT_LABEL[kind]
}

export function onboardingSplitPreferenceLabel(value: string | null | undefined): string {
  if (!value) return 'Not set'
  return ONBOARDING_PREF_LABEL[value as OnboardingSplitPreference] ?? value.replace(/_/g, ' ')
}

export function checkinSplitPreferenceLabel(value: string | null | undefined): string {
  if (!value) return 'Not set'
  return CHECKIN_PREF_LABEL[value as CheckinSplitPreference] ?? value.replace(/_/g, ' ')
}

export function normalizeOnboardingSplitPreference(
  value: unknown
): OnboardingSplitPreference | null {
  if (typeof value !== 'string') return null
  const v = value.trim()
  if (v === 'system_decide' || v === 'ppl' || v === 'upper_lower' || v === 'full_body') return v
  return null
}

export function normalizeCheckinSplitPreference(value: unknown): CheckinSplitPreference | null {
  if (typeof value !== 'string') return null
  const v = value.trim()
  if (
    v === 'keep' ||
    v === 'change_system' ||
    v === 'ppl' ||
    v === 'upper_lower' ||
    v === 'full_body'
  ) {
    return v
  }
  return null
}

/**
 * Detect the established split from published workout prose.
 * Prefers day-title / overview labels over incidental exercise words (push-up, pull-up).
 */
export function detectWorkoutSplit(workoutPlan: string | null | undefined): WorkoutSplitKind {
  const text = workoutPlan?.trim() ?? ''
  if (!text) return 'unknown'

  const mentionsPpl = /\bppl\b|push\s*[/\-]\s*pull\s*[/\-]\s*legs/i.test(text)
  const hasPushDay =
    /\bpush\s*day\b/i.test(text) ||
    /\bday\s*\d+[^\n]{0,80}\bpush\b(?!\s*-?\s*ups?\b)/i.test(text) ||
    /\bpush\s*focus\b/i.test(text) ||
    /^\s*push\s*$/im.test(text)
  const hasPullDay =
    /\bpull\s*day\b/i.test(text) ||
    /\bday\s*\d+[^\n]{0,80}\bpull\b(?!\s*-?\s*ups?\b)/i.test(text) ||
    /\bpull\s*focus\b/i.test(text) ||
    /^\s*pull\s*$/im.test(text)
  const hasLegsDay =
    /\blegs?\s*day\b/i.test(text) ||
    /\bday\s*\d+[^\n]{0,80}\blegs?\b/i.test(text) ||
    /\bleg\s*dominant\b/i.test(text) ||
    /^\s*legs?\s*$/im.test(text)
  const hasUpper =
    /\bupper\s*(body\s*)?day\b/i.test(text) ||
    /\bday\s*\d+[^\n]{0,80}\bupper\b/i.test(text) ||
    /\bupper\s*hypertrophy\b/i.test(text)
  const hasLower =
    /\blower\s*(body\s*)?day\b/i.test(text) ||
    /\bday\s*\d+[^\n]{0,80}\blower\b/i.test(text) ||
    /\blower\s*power\b/i.test(text)
  const mentionsFullBody = /\bfull[\s-]?body\b/i.test(text)

  if (mentionsPpl || (hasPushDay && hasPullDay && hasLegsDay)) return 'ppl'
  if (hasUpper && hasLower) return 'upper_lower'
  if (mentionsFullBody) return 'full_body'
  return 'unknown'
}

export function parseTrainingDaysPerWeek(profile: ProfileForSplit | null | undefined): number | null {
  if (!profile) return null
  const raw = profile.onboarding_data?.training?.daysPerWeek ?? null
  if (raw == null || raw === '') return null
  const n = Number(String(raw).replace(/[^0-9]/g, ''))
  if (!Number.isFinite(n) || n < 1 || n > 7) return null
  return n
}

/**
 * Defaults when the client chose "decide for me" or left preference blank.
 * Never a full-body day. 3 days or 6–7 days → PPL. Every other schedule → upper/lower.
 */
export function defaultWorkoutSplit(profile: ProfileForSplit | null | undefined): WorkoutSplitKind {
  const days = parseTrainingDaysPerWeek(profile) ?? 4
  if (days === 3 || days >= 6) return 'ppl'
  return 'upper_lower'
}

function onboardingPreferredKind(
  profile: ProfileForSplit | null | undefined
): Exclude<WorkoutSplitKind, 'unknown'> | null {
  const raw = normalizeOnboardingSplitPreference(
    profile?.onboarding_data?.training?.workoutSplitPreference
  )
  if (!raw || raw === 'system_decide') return null
  return raw
}

function alternateSplit(
  current: Exclude<WorkoutSplitKind, 'unknown'>,
  profile: ProfileForSplit | null | undefined
): Exclude<WorkoutSplitKind, 'unknown'> {
  const days = parseTrainingDaysPerWeek(profile) ?? 4
  const options: Array<'ppl' | 'upper_lower'> =
    days === 3 || days >= 6 ? ['ppl', 'upper_lower'] : ['upper_lower', 'ppl']
  return options.find((option) => option !== current) ?? (current === 'ppl' ? 'upper_lower' : 'ppl')
}

export function resolveStickySplit(
  priorWorkout: string | null | undefined,
  profile?: ProfileForSplit | null,
  checkinSplitPreference?: string | null
): {
  kind: Exclude<WorkoutSplitKind, 'unknown'>
  source: 'prior' | 'default' | 'onboarding' | 'checkin' | 'unmixed'
  mode: 'keep' | 'change'
} {
  const checkinPref = normalizeCheckinSplitPreference(checkinSplitPreference)
  const unmixedDefault = (): 'ppl' | 'upper_lower' => {
    const kind = defaultWorkoutSplit(profile)
    return kind === 'ppl' ? 'ppl' : 'upper_lower'
  }

  if (checkinPref && checkinPref !== 'keep') {
    if (checkinPref === 'change_system' || checkinPref === 'full_body') {
      const prior = detectWorkoutSplit(priorWorkout)
      let kind = unmixedDefault()
      if (prior !== 'unknown' && prior !== 'full_body' && prior === kind) {
        kind = alternateSplit(prior, profile)
      }
      return {
        kind,
        source: checkinPref === 'full_body' ? 'unmixed' : 'checkin',
        mode: 'change',
      }
    }
    return { kind: checkinPref, source: 'checkin', mode: 'change' }
  }

  const prior = detectWorkoutSplit(priorWorkout)
  if (prior === 'full_body') {
    return { kind: unmixedDefault(), source: 'unmixed', mode: 'change' }
  }
  if (prior !== 'unknown') {
    return { kind: prior, source: 'prior', mode: 'keep' }
  }

  const onboardingKind = onboardingPreferredKind(profile)
  if (onboardingKind === 'full_body') {
    return { kind: unmixedDefault(), source: 'unmixed', mode: 'change' }
  }
  if (onboardingKind) {
    return { kind: onboardingKind, source: 'onboarding', mode: 'keep' }
  }

  return {
    kind: unmixedDefault(),
    source: 'default',
    mode: 'keep',
  }
}

export function formatStickySplitGuidance(opts: {
  priorWorkout?: string | null
  profile?: ProfileForSplit | null
  checkinSplitPreference?: string | null
}): string {
  const sticky = resolveStickySplit(
    opts.priorWorkout,
    opts.profile,
    opts.checkinSplitPreference
  )
  const label = SPLIT_LABEL[sticky.kind]
  const days = parseTrainingDaysPerWeek(opts.profile)
  const onboardingPref = normalizeOnboardingSplitPreference(
    opts.profile?.onboarding_data?.training?.workoutSplitPreference
  )
  const checkinPref = normalizeCheckinSplitPreference(opts.checkinSplitPreference)

  const lines = [
    '## Sticky workout split (authoritative — obey this)',
    checkinPref
      ? `- Weekly check-in split choice: ${CHECKIN_PREF_LABEL[checkinPref]}.`
      : '- Weekly check-in split choice: not reported (default KEEP current split).',
    onboardingPref
      ? `- Onboarding split preference: ${ONBOARDING_PREF_LABEL[onboardingPref]}.`
      : null,
    sticky.source === 'unmixed'
      ? `- A full-body or mixed session is not allowed. Use: ${label}${days != null ? ` (${days} training days/week)` : ''}. Rebuild the days. Do not keep legs on an upper day or presses and rows on a leg day.`
      : sticky.mode === 'change'
        ? `- Client asked to CHANGE structure. Use: ${label}${days != null ? ` (${days} training days/week)` : ''}. Rebuild day titles for this split. Do not keep the previous day structure.`
        : sticky.source === 'prior'
          ? `- Established split on file: ${label}. KEEP this day structure.`
          : sticky.source === 'onboarding'
            ? `- Client onboarding preference: ${label}. Use this split.`
            : `- No established split on file — system default for this client: ${label}${days != null ? ` (${days} training days/week)` : ''}.`,
    '- Never mix body parts in one session. No full-body day. An upper day may combine chest, back, shoulders, and arms. A lower day may combine a squat or leg press, a hinge, and calves. Push, pull, and legs stay on their own days when that is the split. A core finisher is allowed on any day.',
    sticky.source === 'unmixed'
      ? '- Replace the mixed week with the split named above. Volume still follows Workout fit.'
      : sticky.mode === 'keep'
        ? '- Mesocycle week 1 (new month): KEEP the same split. Refresh exercise selection. Volume follows Workout fit, not a beginner 2-set week. Do NOT open a different template unless the weekly check-in asked to change.'
        : '- Because the client asked to change split, a new proven template is required this week. Volume still follows Workout fit.',
    '- Low sleep, fatigue, stress, or low adherence: cut load, sets, or leave more reps in reserve. That alone is NOT a reason to change an upper/lower or push/pull/legs week.',
    '- Do not invent a full-body week. Only change an already separated split when this check-in or onboarding preference says so.',
  ]

  return lines.filter((line): line is string => Boolean(line)).join('\n')
}

export function normalizeWorkoutDifficulty(value: unknown): WorkoutDifficulty | null {
  const raw = typeof value === 'string' ? value.trim().toLowerCase() : ''
  if (raw === 'easy') return 'easier'
  if (WORKOUT_DIFFICULTY_OPTIONS.some((option) => option.value === raw)) {
    return raw as WorkoutDifficulty
  }
  return null
}

export function workoutDifficultyLabel(value: string | null | undefined): string {
  const normalized = normalizeWorkoutDifficulty(value)
  const match = WORKOUT_DIFFICULTY_OPTIONS.find((option) => option.value === normalized)
  return match?.label ?? 'Keep the current difficulty'
}

export function formatTrainingChoiceNote(
  split: string | null | undefined,
  difficulty: string | null | undefined
): string {
  return [
    `Workout split: ${checkinSplitPreferenceLabel(split)}.`,
    `Workout difficulty: ${workoutDifficultyLabel(difficulty)}.`,
    'One place only for the whole week, gym or home. Do not write a mixed gym-and-home plan.',
  ].join(' ')
}

/**
 * Hard workout rules for generation. Difficulty and place come from the coach
 * input or the Sunday check-in. A "both" location is gym only — never a mix.
 */
export function formatWorkoutFitGuidance(opts: {
  difficulty?: string | null
  location?: string | null
  experience?: string | null
}): string {
  const difficulty = normalizeWorkoutDifficulty(opts.difficulty) ?? 'keep'
  const experience = (opts.experience ?? '').trim().toLowerCase()
  const experienced = experience === 'intermediate' || experience === 'advanced'
  const location = (opts.location ?? '').trim().toLowerCase()
  const place =
    location === 'home'
      ? 'HOME only. Every working day uses their home equipment. Do not add gym machines.'
      : 'GYM only. Every working day is a gym session. Do not add a separate home program.'

  const volume =
    difficulty === 'easier'
      ? 'EASIER, as they asked: 2 working sets, leave about 3 reps in reserve, and do not add load this week.'
      : difficulty === 'hard'
        ? 'HARD, as they asked: 4 working sets on main lifts and 3 on accessories. Leave 1 to 2 reps in reserve. Loads must suit someone who already trains. Do not write a light intro week.'
        : difficulty === 'moderate'
          ? experienced
            ? 'MODERATE and matched to them: they are intermediate or advanced, so use 4 working sets on main lifts and 3 on accessories. Do not give them a beginner 2-set plan.'
            : 'MODERATE and matched to them: they are a beginner, so use 3 working sets and leave 2 to 3 reps in reserve.'
          : experienced
            ? 'KEEP the current difficulty, but they are intermediate or advanced. Do not drop them onto a beginner 2-set week. Use at least 4 working sets on main lifts unless they asked for easier.'
            : 'KEEP the current difficulty. A beginner stays at 3 working sets. Do not write a plan that feels empty.'

  return [
    '### Workout fit (hard)',
    `- Place: ${place} Never a mixed gym-and-home plan.`,
    `- Difficulty: ${volume}`,
    '- Split: use the sticky split above. One body region per day. Never a full-body session.',
    '- If the coach note names a difficulty, or upper/lower, or push/pull/legs, that choice wins. A request for a full-body or mixed session does not.',
  ].join('\n')
}