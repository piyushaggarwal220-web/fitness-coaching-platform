import type { OnboardingProfile } from '@/types/database'

/** Proven split templates used across initial + weekly programming. */
export type WorkoutSplitKind = 'ppl' | 'upper_lower' | 'full_body' | 'unknown'

const SPLIT_LABEL: Record<Exclude<WorkoutSplitKind, 'unknown'>, string> = {
  ppl: 'Push / Pull / Legs (PPL)',
  upper_lower: 'Upper / Lower',
  full_body: 'Full body',
}

type ProfileForSplit = Pick<
  OnboardingProfile,
  'fitness_goal' | 'training_experience' | 'training_days_per_week' | 'onboarding_data'
>

/**
 * Detect the established split from published workout prose.
 * Prefers day-title / overview labels over incidental exercise words (push-up, pull-up).
 */
export function detectWorkoutSplit(workoutPlan: string | null | undefined): WorkoutSplitKind {
  const text = workoutPlan?.trim() ?? ''
  if (!text) return 'unknown'

  const mentionsPpl = /\bppl\b|push\s*[/\-]\s*pull\s*[/\-]\s*legs/i.test(text)
  // Day title on same line, or a standalone "Push"/"Pull"/"Legs" line under the day header.
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
  const raw =
    profile.onboarding_data?.training?.daysPerWeek ??
    profile.training_days_per_week ??
    null
  if (raw == null || raw === '') return null
  const n = Number(String(raw).replace(/[^0-9]/g, ''))
  if (!Number.isFinite(n) || n < 1 || n > 7) return null
  return n
}

/**
 * Goal + days defaults for NEW clients only (no established prior split).
 * Beginners / ≤3 days → full body. 4–5 days → upper/lower. 6–7 days → PPL.
 */
export function defaultWorkoutSplit(profile: ProfileForSplit | null | undefined): WorkoutSplitKind {
  const days = parseTrainingDaysPerWeek(profile) ?? 4
  const experience = (profile?.training_experience ?? '').toLowerCase()

  if (experience === 'beginner' || days <= 3) return 'full_body'
  if (days >= 6) return 'ppl'
  if (days >= 4) return 'upper_lower'
  return 'full_body'
}

export function resolveStickySplit(
  priorWorkout: string | null | undefined,
  profile?: ProfileForSplit | null
): { kind: Exclude<WorkoutSplitKind, 'unknown'>; source: 'prior' | 'default' } {
  const prior = detectWorkoutSplit(priorWorkout)
  if (prior !== 'unknown') {
    return { kind: prior, source: 'prior' }
  }
  const fallback = defaultWorkoutSplit(profile)
  return {
    kind: fallback === 'unknown' ? 'full_body' : fallback,
    source: 'default',
  }
}

export function formatStickySplitGuidance(opts: {
  priorWorkout?: string | null
  profile?: ProfileForSplit | null
}): string {
  const sticky = resolveStickySplit(opts.priorWorkout, opts.profile)
  const label = SPLIT_LABEL[sticky.kind]
  const days = parseTrainingDaysPerWeek(opts.profile)

  return [
    '## Sticky workout split (authoritative — obey this)',
    sticky.source === 'prior'
      ? `- Established split on file: ${label}. KEEP this day structure.`
      : `- No established split on file — default for this client: ${label}${days != null ? ` (${days} training days/week)` : ''}.`,
    '- Mesocycle week 1 (new month): KEEP the same split. Refresh exercise selection and reset to BASE volume within that split. Do NOT open a different template (no silent full-body swap, no PPL ↔ upper/lower rotation).',
    '- Low sleep, fatigue, stress, or low adherence: cut load, sets, or leave more reps in reserve. Do NOT change the split structure.',
    '- Change split structure ONLY when the coach or client explicitly asks for a different split (or a remake that names one).',
  ].join('\n')
}