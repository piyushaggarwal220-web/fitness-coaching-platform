import type { Checkin, CheckinType } from '@/types/database'

export function formatMidWeekCheckinChatMessage(input: {
  coachingWeek: number
  dietAdherence: number
  workoutAdherence: number
  energyLevel: number
  sleepQuality: number
  stressLevel: number
  hungerLevel: number
  adherenceWins?: string | null
  adherenceStruggles?: string | null
  painInjuries?: string | null
  questionsForCoach?: string | null
  additionalComments?: string | null
}): string {
  const lines = [
    '📋 Mid Week Check-in',
    '',
    `Week ${input.coachingWeek}`,
    '',
    `Diet: ${input.dietAdherence}/10`,
    `Workout: ${input.workoutAdherence}/10`,
    `Energy: ${input.energyLevel}/10`,
    `Sleep: ${input.sleepQuality}/10`,
    `Stress: ${input.stressLevel}/10`,
    `Hunger: ${input.hungerLevel}/10`,
  ]

  if (input.adherenceWins?.trim()) {
    lines.push('', 'Adherence wins', input.adherenceWins.trim())
  }

  if (input.adherenceStruggles?.trim()) {
    lines.push('', 'Adherence slips', input.adherenceStruggles.trim())
  }

  if (input.painInjuries?.trim()) {
    lines.push('', 'Pain', input.painInjuries.trim())
  }

  if (input.questionsForCoach?.trim()) {
    lines.push('', 'Question', input.questionsForCoach.trim())
  }

  if (input.additionalComments?.trim()) {
    lines.push('', 'Additional comments', input.additionalComments.trim())
  }

  lines.push(
    '',
    'Coach reply requested',
    'Please send a short response in this chat. No plan update is needed.'
  )

  return lines.join('\n')
}

export function formatWeeklyCheckinChatMessage(input: {
  coachingWeek: number
  weight: number
  chest?: number | null
  thigh?: number | null
  navel?: number | null
  dietAdherence: number
  workoutAdherence: number
  energyLevel: number
  sleepQuality: number
  stressLevel: number
  motivationLevel?: number | null
  progressRating?: number | null
  progressNotes?: string | null
  painInjuries?: string | null
  notes?: string | null
  questionsForCoach?: string | null
  photoCount: number
  journeyUrl?: string
}): string {
  const lines = [
    '📋 Weekly Check-in',
    '',
    `Week ${input.coachingWeek}`,
    '',
    `Weight: ${input.weight} kg`,
  ]

  if (input.chest != null) lines.push(`Chest: ${input.chest} cm`)
  if (input.thigh != null) lines.push(`Thigh: ${input.thigh} cm`)
  if (input.navel != null) lines.push(`Belly (navel): ${input.navel} cm`)

  lines.push(
    `Diet: ${input.dietAdherence}/10`,
    `Workout: ${input.workoutAdherence}/10`,
    `Energy: ${input.energyLevel}/10`,
    `Sleep: ${input.sleepQuality}/10`,
    `Stress: ${input.stressLevel}/10`,
  )

  if (input.motivationLevel != null) {
    lines.push(`Motivation: ${input.motivationLevel}/10`)
  }

  if (input.progressRating != null) {
    lines.push(`Progress: ${input.progressRating}/10`)
  }

  if (input.progressNotes?.trim()) {
    lines.push('', 'Progress notes', input.progressNotes.trim())
  }

  if (input.photoCount > 0) {
    lines.push('', `Photos: ${input.photoCount} progress photo${input.photoCount === 1 ? '' : 's'} uploaded`)
  }

  if (input.painInjuries?.trim()) {
    lines.push('', 'Pain', input.painInjuries.trim())
  }

  if (input.notes?.trim()) {
    lines.push('', 'Notes', input.notes.trim())
  }

  if (input.questionsForCoach?.trim()) {
    lines.push('', 'Question', input.questionsForCoach.trim())
  }

  if (input.journeyUrl) {
    lines.push('', `Journey: ${input.journeyUrl}`)
  }

  return lines.join('\n')
}

export function isCheckinSystemMessage(content: string | null | undefined): boolean {
  if (!content) return false
  return content.startsWith('📋 Mid Week Check-in') || content.startsWith('📋 Weekly Check-in')
}

export function checkinTypeFromMessage(content: string): CheckinType | null {
  if (content.startsWith('📋 Mid Week Check-in')) return 'mid_week'
  if (content.startsWith('📋 Weekly Check-in')) return 'weekly'
  return null
}

function asScore(value: unknown, fallback = 0): number {
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : fallback
}

/** Build the chat summary card text from a persisted check-in row. */
export function formatCheckinChatMessageFromRow(checkin: Checkin): string | null {
  const week = asScore(checkin.coaching_week, 0)

  if (checkin.checkin_type === 'mid_week') {
    return formatMidWeekCheckinChatMessage({
      coachingWeek: week,
      dietAdherence: asScore(checkin.diet_adherence),
      workoutAdherence: asScore(checkin.workout_adherence),
      energyLevel: asScore(checkin.energy_level),
      sleepQuality: asScore(checkin.sleep_quality),
      stressLevel: asScore(checkin.stress_level),
      hungerLevel: asScore(checkin.hunger_level),
      adherenceWins: checkin.adherence_wins,
      adherenceStruggles: checkin.adherence_struggles,
      painInjuries: checkin.pain_injuries,
      questionsForCoach: checkin.questions_for_coach,
      additionalComments: checkin.notes,
    })
  }

  if (checkin.checkin_type === 'weekly') {
    if (checkin.weight == null || checkin.weight === ('' as unknown)) {
      return null
    }

    const photoCount =
      Number(Boolean(checkin.progress_photo_front)) +
      Number(Boolean(checkin.progress_photo_side)) +
      Number(Boolean(checkin.progress_photo_back)) +
      (checkin.extra_photos?.length ?? 0)

    return formatWeeklyCheckinChatMessage({
      coachingWeek: week,
      weight: asScore(checkin.weight),
      chest: checkin.chest == null ? null : asScore(checkin.chest),
      thigh: checkin.thigh == null ? null : asScore(checkin.thigh),
      navel: checkin.navel == null ? null : asScore(checkin.navel),
      dietAdherence: asScore(checkin.diet_adherence),
      workoutAdherence: asScore(checkin.workout_adherence),
      energyLevel: asScore(checkin.energy_level),
      sleepQuality: asScore(checkin.sleep_quality),
      stressLevel: asScore(checkin.stress_level),
      motivationLevel: checkin.motivation_level == null ? null : asScore(checkin.motivation_level),
      progressRating: checkin.progress_rating == null ? null : asScore(checkin.progress_rating),
      progressNotes: checkin.progress_notes,
      painInjuries: checkin.pain_injuries,
      notes: checkin.notes,
      questionsForCoach: checkin.questions_for_coach,
      photoCount,
      journeyUrl: '/journey',
    })
  }

  return null
}
