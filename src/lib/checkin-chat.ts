import type { Checkin, CheckinType } from '@/types/database'

export function formatMidWeekCheckinChatMessage(input: {
  coachingWeek: number
  dietAdherence: number
  workoutAdherence: number
  energyLevel: number
  sleepQuality: number
  stressLevel: number
  painInjuries?: string | null
  questionsForCoach?: string | null
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
  ]

  if (input.painInjuries?.trim()) {
    lines.push('', 'Pain', input.painInjuries.trim())
  }

  if (input.questionsForCoach?.trim()) {
    lines.push('', 'Question', input.questionsForCoach.trim())
  }

  return lines.join('\n')
}

export function formatWeeklyCheckinChatMessage(input: {
  coachingWeek: number
  weight: number
  dietAdherence: number
  workoutAdherence: number
  energyLevel: number
  sleepQuality: number
  stressLevel: number
  motivationLevel?: number | null
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
    `Diet: ${input.dietAdherence}/10`,
    `Workout: ${input.workoutAdherence}/10`,
    `Energy: ${input.energyLevel}/10`,
    `Sleep: ${input.sleepQuality}/10`,
    `Stress: ${input.stressLevel}/10`,
  ]

  if (input.motivationLevel != null) {
    lines.push(`Motivation: ${input.motivationLevel}/10`)
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

  lines.push('', `View journey: ${input.journeyUrl ?? '/journey'}`)

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
