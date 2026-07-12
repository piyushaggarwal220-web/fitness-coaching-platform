import { clientCoachNotes } from '@/lib/plan-metadata'

export type CompareLine = {
  text: string
  changed: boolean
}

export type SectionDiff = {
  label: string
  changed: boolean
  leftLines: CompareLine[]
  rightLines: CompareLine[]
}

function lineDiff(left: string, right: string): { leftLines: CompareLine[]; rightLines: CompareLine[]; changed: boolean } {
  const leftParts = left.split('\n')
  const rightParts = right.split('\n')
  const max = Math.max(leftParts.length, rightParts.length)
  let changed = false

  const leftLines: CompareLine[] = []
  const rightLines: CompareLine[] = []

  for (let i = 0; i < max; i++) {
    const l = leftParts[i] ?? ''
    const r = rightParts[i] ?? ''
    const lineChanged = l !== r
    if (lineChanged) changed = true
    leftLines.push({ text: l, changed: lineChanged })
    rightLines.push({ text: r, changed: lineChanged })
  }

  return { leftLines, rightLines, changed }
}

export function comparePlanSections(
  planA: {
    nutrition_plan?: string | null
    workout_plan?: string | null
    cardio_plan?: string | null
    supplement_plan?: string | null
    coach_notes?: string | null
  },
  planB: {
    nutrition_plan?: string | null
    workout_plan?: string | null
    cardio_plan?: string | null
    supplement_plan?: string | null
    coach_notes?: string | null
  }
): SectionDiff[] {
  const sections: { label: string; a: string; b: string }[] = [
    { label: 'Nutrition', a: planA.nutrition_plan ?? '', b: planB.nutrition_plan ?? '' },
    { label: 'Workout', a: planA.workout_plan ?? '', b: planB.workout_plan ?? '' },
    { label: 'Cardio', a: planA.cardio_plan ?? '', b: planB.cardio_plan ?? '' },
    { label: 'Supplements', a: planA.supplement_plan ?? '', b: planB.supplement_plan ?? '' },
    {
      label: 'Coach Notes',
      a: clientCoachNotes(planA.coach_notes),
      b: clientCoachNotes(planB.coach_notes),
    },
  ]

  return sections.map(({ label, a, b }) => {
    const diff = lineDiff(a.trim(), b.trim())
    return { label, ...diff }
  })
}

/** Extract calorie/macro hints from nutrition prose for highlight badges. */
export function extractNutritionHighlights(text: string | null | undefined): string[] {
  if (!text?.trim()) return []
  const highlights: string[] = []
  const patterns = [
    /~?\s*(\d{3,4})\s*kcal/gi,
    /calories?[:\s]+(\d{3,4})/gi,
    /P:\s*(\d+)\s*g/gi,
    /protein[:\s]+(\d+)\s*g/gi,
    /C:\s*(\d+)\s*g/gi,
    /carbs?[:\s]+(\d+)\s*g/gi,
    /F:\s*(\d+)\s*g/gi,
    /fat[:\s]+(\d+)\s*g/gi,
  ]

  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (match?.[0]) highlights.push(match[0].trim())
  }

  return [...new Set(highlights)].slice(0, 6)
}

/** Merge highlights from multiple nutrition blocks without duplicate keys in UI. */
export function mergeNutritionHighlights(
  ...texts: (string | null | undefined)[]
): string[] {
  return [...new Set(texts.flatMap((text) => extractNutritionHighlights(text)))]
}
