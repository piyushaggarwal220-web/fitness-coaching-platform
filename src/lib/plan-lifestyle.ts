import { getOnboardingLabel } from '@/lib/onboarding'
import type { OnboardingProfile, PlanFormData } from '@/types/database'

const NONE_SUPPLEMENT =
  /^(none|no|n\/a|na|nil|not taking|nothing|-|\.|no supplements?)\.?$/i

/** True when the client opted into whey or listed current supplements. */
export function clientWantsSupplements(profile: OnboardingProfile | null | undefined): boolean {
  if (!profile) return false
  const whey = (profile.onboarding_data?.diet?.wheyProtein ?? '').toLowerCase()
  if (whey === 'yes' || whey === 'sometimes') return true

  const current = (profile.onboarding_data?.supplements?.current ?? '').trim()
  if (!current) return false
  return !NONE_SUPPLEMENT.test(current)
}

function targetWaterLiters(profile: OnboardingProfile): number {
  const raw = (profile.onboarding_data?.lifestyle?.waterIntake ?? '').toLowerCase()
  if (raw.includes('over_3') || raw.includes('4')) return 3.5
  if (raw.includes('2_3') || raw.includes('2-3')) return 3
  if (raw.includes('1_2') || raw.includes('1-2')) return 2.5
  if (raw.includes('under')) return 2
  return 3
}

function targetSleepHours(profile: OnboardingProfile): { hours: string; bedtime: string } {
  const sleep = profile.sleep_duration ?? ''
  if (sleep === 'less_than_6') return { hours: '7 to 8', bedtime: '10:30 PM' }
  if (sleep === '6_to_7') return { hours: '7 to 8', bedtime: '10:30 PM' }
  if (sleep === '8_plus') return { hours: '8', bedtime: '10:00 PM' }
  return { hours: '7 to 8', bedtime: '10:30 PM' }
}

/** Default sleep block when AI omitted it. */
export function buildDefaultSleepGuidance(profile: OnboardingProfile): string {
  const { hours, bedtime } = targetSleepHours(profile)
  const current = getOnboardingLabel('sleep_duration', profile.sleep_duration)
  return [
    'Sleep Guidance',
    `Aim for ${hours} hours most nights. Target bedtime around ${bedtime}.`,
    `You currently report: ${current}. Protect a consistent wind down (dim screens 30 to 45 minutes before bed, keep the room cool and dark).`,
    'If sleep slips under 6 hours, keep training but reduce intensity the next day and prioritize an earlier bedtime.',
  ].join('\n')
}

/** Default water block when AI omitted it. */
export function buildDefaultWaterGuidance(profile: OnboardingProfile): string {
  const liters = targetWaterLiters(profile)
  const current = getOnboardingLabel(
    'water_intake',
    profile.onboarding_data?.lifestyle?.waterIntake
  )
  return [
    'Water Intake',
    `Daily target: ${liters} L (${Math.round(liters * 1000)} ml).`,
    `You currently report: ${current}. Spread intake across the day (a glass on waking, with meals, and around training).`,
    'On heavier training or hot days, push toward the top of this range. Limit replacing water with sugary drinks.',
  ].join('\n')
}

const SLEEP_BLOCK_RE =
  /(?:^|\n)\s*(?:\*{0,2}|#{1,3}\s*)?sleep(?:\s+guidance|\s+plan|\s+tips?)?\s*:?\s*\*{0,2}\s*\n([\s\S]*?)(?=\n\s*(?:\*{0,2}|#{1,3}\s*)?(?:water(?:\s+intake)?|cardio|diet|workout|supplements?|coach\s*notes?)\b|\s*$)/i

const WATER_BLOCK_RE =
  /(?:^|\n)\s*(?:\*{0,2}|#{1,3}\s*)?water(?:\s+intake|\s+target|\s+guidance)?\s*:?\s*\*{0,2}\s*\n([\s\S]*?)(?=\n\s*(?:\*{0,2}|#{1,3}\s*)?(?:sleep(?:\s+guidance)?|cardio|diet|workout|supplements?|coach\s*notes?)\b|\s*$)/i

const INLINE_WATER_RE =
  /(?:^|\n)\s*(?:\*{0,2})?water(?:\s+intake|\s+target)?\s*:?\s*[-–—]?\s*\*{0,2}\s*([^\n]+)/i

const INLINE_SLEEP_RE =
  /(?:^|\n)\s*(?:\*{0,2})?sleep(?:\s+guidance|\s+plan|\s+tips?)?\s*:?\s*[-–—]?\s*\*{0,2}\s*([^\n]+)/i

export function extractSleepGuidance(...sources: (string | null | undefined)[]): string {
  for (const source of sources) {
    const text = source?.trim() ?? ''
    if (!text) continue
    const match = text.match(SLEEP_BLOCK_RE)
    if (match?.[1]?.trim()) {
      return `Sleep Guidance\n${match[1].trim()}`
    }
    const inline = text.match(INLINE_SLEEP_RE)
    if (inline?.[1]?.trim() && inline[1].trim().length > 8) {
      return `Sleep Guidance\n${inline[1].trim()}`
    }
    // Whole field is already a sleep section
    if (/^sleep(?:\s+guidance)?\b/i.test(text) && text.length > 40) {
      return text.startsWith('Sleep') ? text : `Sleep Guidance\n${text}`
    }
  }
  return ''
}

export function extractWaterGuidance(...sources: (string | null | undefined)[]): string {
  for (const source of sources) {
    const text = source?.trim() ?? ''
    if (!text) continue
    const block = text.match(WATER_BLOCK_RE)
    if (block?.[1]?.trim()) {
      return `Water Intake\n${block[1].trim()}`
    }
    const inline = text.match(INLINE_WATER_RE)
    if (inline?.[1]?.trim()) {
      return `Water Intake\n${inline[1].trim()}`
    }
    if (/^water(?:\s+intake)?\b/i.test(text) && text.length > 20) {
      return text.startsWith('Water') ? text : `Water Intake\n${text}`
    }
  }
  return ''
}

function stripBlock(text: string, pattern: RegExp): string {
  return text.replace(pattern, '\n').replace(/\n{3,}/g, '\n\n').trim()
}

export function stripSleepGuidance(text: string): string {
  return stripBlock(text, SLEEP_BLOCK_RE)
}

export function stripWaterGuidance(text: string): string {
  let out = stripBlock(text, WATER_BLOCK_RE)
  out = out.replace(INLINE_WATER_RE, '\n').replace(/\n{3,}/g, '\n\n').trim()
  return out
}

/**
 * Ensure cardio_plan / workout_plan contain explicit Sleep + Water blocks
 * so the client plan page can always surface them.
 * Prefer cardio_plan for lifestyle blocks so coach_notes stays free for the coach's voice.
 */
export function ensurePlanLifestyleSections(
  form: PlanFormData,
  profile: OnboardingProfile
): PlanFormData {
  const sleep = extractSleepGuidance(form.cardio_plan, form.workout_plan, form.coach_notes)
  const water = extractWaterGuidance(form.cardio_plan, form.coach_notes, form.nutrition_plan)

  let cardio = form.cardio_plan?.trim() ?? ''
  let workout = form.workout_plan?.trim() ?? ''
  let supplements = form.supplement_plan?.trim() ?? ''

  if (!sleep) {
    const block = buildDefaultSleepGuidance(profile)
    cardio = cardio ? `${cardio}\n\n${block}` : block
  }

  if (!water) {
    const block = buildDefaultWaterGuidance(profile)
    cardio = cardio ? `${cardio}\n\n${block}` : block
  }

  if (!clientWantsSupplements(profile)) {
    supplements = ''
  }

  return {
    ...form,
    workout_plan: workout,
    cardio_plan: cardio,
    supplement_plan: supplements,
  }
}

export type ClientPlanDisplaySection = {
  key: 'diet' | 'workout' | 'sleep' | 'cardio' | 'water' | 'supplements' | 'notes'
  title: string
  content: string
}

/**
 * Resolve client-facing plan sections with clear labels.
 * Sleep/Water are peeled out of notes/cardio so they show as their own sections.
 */
export function resolveClientPlanDisplaySections(
  sections: {
    diet: string
    workout: string
    supplements: string
    cardio: string
    coachNotes: string
  },
  profile?: OnboardingProfile | null
): ClientPlanDisplaySection[] {
  const sleep =
    extractSleepGuidance(sections.cardio, sections.workout, sections.coachNotes) ||
    (profile ? buildDefaultSleepGuidance(profile) : '')
  const water =
    extractWaterGuidance(sections.cardio, sections.coachNotes, sections.diet) ||
    (profile ? buildDefaultWaterGuidance(profile) : '')

  const cardioBody = stripWaterGuidance(stripSleepGuidance(sections.cardio)).trim()
  const notesBody = stripSleepGuidance(stripWaterGuidance(sections.coachNotes)).trim()
  const workoutBody = stripSleepGuidance(sections.workout).trim()
  const wantsSupplements = profile ? clientWantsSupplements(profile) : Boolean(sections.supplements.trim())

  const items: ClientPlanDisplaySection[] = [
    { key: 'diet', title: 'Diet Chart', content: sections.diet.trim() },
    { key: 'workout', title: 'Workout Plan', content: workoutBody },
    { key: 'sleep', title: 'Sleep Guidance', content: sleep },
    { key: 'cardio', title: 'Cardio Guidance', content: cardioBody },
    { key: 'water', title: 'Water Intake', content: water },
  ]

  if (wantsSupplements && sections.supplements.trim()) {
    items.push({
      key: 'supplements',
      title: 'Supplement Guidance',
      content: sections.supplements.trim(),
    })
  }

  if (notesBody) {
    items.push({ key: 'notes', title: 'Coach Notes', content: notesBody })
  }

  return items.filter((item) => item.content.trim().length > 0)
}
