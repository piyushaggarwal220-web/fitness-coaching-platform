/**
 * Short-form structure selection from topic / objective / available footage roles.
 */

import type { CreativeFormat, CreativeObjective, StructureId } from '@/lib/jarvis/creative/types'
import { STRUCTURE_CATALOG } from '@/lib/jarvis/creative/types'

export function selectStructure(input: {
  objective?: CreativeObjective | string | null
  format?: CreativeFormat | string | null
  hasMyth?: boolean
  hasStory?: boolean
  hasListPoints?: boolean
  hasQuestion?: boolean
}): { structure_id: StructureId; steps: string[] } {
  if (input.hasMyth) {
    return {
      structure_id: 'HOOK_MYTH_TRUTH_EXPLAIN_CTA',
      steps: STRUCTURE_CATALOG.HOOK_MYTH_TRUTH_EXPLAIN_CTA,
    }
  }
  if (input.hasStory || input.format === 'STORY') {
    return {
      structure_id: 'HOOK_STORY_LESSON_CTA',
      steps: STRUCTURE_CATALOG.HOOK_STORY_LESSON_CTA,
    }
  }
  if (input.hasListPoints || input.format === 'LIST') {
    return {
      structure_id: 'HOOK_THREE_POINTS_CTA',
      steps: STRUCTURE_CATALOG.HOOK_THREE_POINTS_CTA,
    }
  }
  if (input.hasQuestion || input.format === 'FAQ') {
    return {
      structure_id: 'QUESTION_ANSWER_EXAMPLE_CTA',
      steps: STRUCTURE_CATALOG.QUESTION_ANSWER_EXAMPLE_CTA,
    }
  }
  return {
    structure_id: 'HOOK_PROBLEM_SOLUTION_CTA',
    steps: STRUCTURE_CATALOG.HOOK_PROBLEM_SOLUTION_CTA,
  }
}

export function inferFormat(input: {
  labels: string[]
  objective?: string | null
}): CreativeFormat {
  const labels = input.labels.map((l) => l.toUpperCase())
  if (labels.includes('MYTH')) return 'MYTH_BUST'
  if (labels.includes('DEMONSTRATION')) return 'DEMONSTRATION'
  if (labels.includes('STORY') || labels.includes('PERSONAL_EXPERIENCE')) return 'STORY'
  if (labels.includes('TESTIMONIAL')) return 'TESTIMONIAL'
  if (input.objective === 'AUTHORITY') return 'HOT_TAKE'
  if (labels.includes('EDUCATION') || labels.includes('EXPLANATION') || labels.includes('TIP')) {
    return 'EDUCATIONAL'
  }
  return 'TALKING_HEAD'
}

export function inferPillar(topic: string, explicit?: string[]): string {
  if (explicit?.length) return explicit[0]!
  const t = topic.toLowerCase()
  if (/belly|fat loss|calorie|deficit|weight/.test(t)) return 'FAT_LOSS'
  if (/protein|nutrition|diet|food/.test(t)) return 'NUTRITION'
  if (/muscle|hypertrophy|gain/.test(t)) return 'MUSCLE_GAIN'
  if (/squat|lift|training|workout|progressive/.test(t)) return 'TRAINING'
  if (/myth/.test(t)) return 'MYTHS'
  if (/beginner|mistake/.test(t)) return 'BEGINNER_MISTAKES'
  if (/transform|journey|story/.test(t)) return 'TRANSFORMATION'
  if (/coach|program|₹|funnel/.test(t)) return 'COACHING'
  return 'FAT_LOSS'
}
