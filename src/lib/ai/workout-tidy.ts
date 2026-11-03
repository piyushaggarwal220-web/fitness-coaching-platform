/**
 * Client-facing workout text: one session per day, one line per exercise,
 * and no lift from the other region on a day that is already named upper or lower.
 * Chest on a leg day is the example. The same rule covers every body part.
 */

const DAY_HEADER =
  /^(?:#{1,3}\s*|\*{1,2}\s*)?(?:day\s*\d+\b|(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b)/i

const EXERCISE_LINE =
  /^(?:[-*•]\s*)?(?:([^:\n]{2,80}?):\s*(\d+)\s*sets?\b|([A-Za-z][^:\n]{1,60}?)\s+(\d+)\s*(?:(?:x|×)\s*\d+|sets?\b))/i

const LOWER_LIFT =
  /\b(squat|leg press|lunge|romanian|deadlift|leg curl|hamstring curl|hip thrust|glute bridge|calf|split squat|hack squat|leg extension|goblet|step up|pull through)\b/i

const UPPER_LIFT =
  /\b(bench|chest press|chest fly|pec|push-?up|pulldown|pull-?up|chin-?up|row|shoulder press|overhead press|lateral raise|rear delt|face pull|fly|curl|tricep|triceps|pushdown|dip)\b/i

const STAYS_ON_ANY_DAY =
  /\b(stretch|pose|plank|dead bug|crunch|pallof|wood chop|bird dog|walk|bike|circle|breathing|foam)\b/i

type DayRegion = 'upper' | 'lower' | null

function exerciseName(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\b(barbell|dumbbell|machine|cable|smith|resistance|band|kettlebell|ez|flat|seated|standing)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function dayRegion(header: string): DayRegion {
  const text = header.toLowerCase()
  const lower = /\b(lower|legs?)\b/.test(text)
  const upper = /\b(upper|chest|push|pull|back|shoulder|arms?)\b/.test(text)
  if (lower && !upper) return 'lower'
  if (upper && !lower) return 'upper'
  return null
}

function lineRegion(line: string): DayRegion {
  if (STAYS_ON_ANY_DAY.test(line)) return null
  const withoutLegCurl = line.replace(/\b(leg|hamstring|lying|nordic)\s+curl\b/gi, '')
  const lower = LOWER_LIFT.test(line)
  const upper = UPPER_LIFT.test(withoutLegCurl)
  if (lower && !upper) return 'lower'
  if (upper && !lower) return 'upper'
  if (lower && upper) return 'lower'
  return null
}

function weekdayKey(header: string): string {
  const named = header.match(/\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i)
  if (named) return named[1].toLowerCase()
  const day = header.match(/\bday\s*(\d+)\b/i)
  return day ? `day-${day[1]}` : header.toLowerCase()
}

function tidyDay(block: string): string {
  const lines = block.split('\n')
  const header = lines[0] ?? ''
  const region = dayRegion(header)
  const kept: string[] = []
  const bestSets = new Map<string, number>()
  const bestIndex = new Map<string, number>()

  for (const line of lines) {
    const match = line.match(EXERCISE_LINE)
    if (!match) {
      kept.push(line)
      continue
    }
    const regionOfLine = lineRegion(line)
    if (region && regionOfLine && regionOfLine !== region) continue
    const name = exerciseName(match[1] ?? match[3] ?? '')
    const sets = Number(match[2] ?? match[4])
    if (!name) {
      kept.push(line)
      continue
    }
    const previous = bestSets.get(name)
    if (previous == null) {
      bestSets.set(name, sets)
      bestIndex.set(name, kept.length)
      kept.push(line)
      continue
    }
    if (sets > previous) {
      const index = bestIndex.get(name)
      if (index != null) kept[index] = line
      bestSets.set(name, sets)
    }
  }

  return kept.join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

/** Drop a pasted second week, a repeated lift, and the other region on a named upper or lower day. */
export function tidyWorkoutPlanText(text: string): string {
  const input = text.replace(/\r\n/g, '\n').trim()
  if (!input) return ''

  const lines = input.split('\n')
  const blocks: string[][] = []
  let preamble: string[] = []
  let current: string[] | null = null

  for (const line of lines) {
    if (DAY_HEADER.test(line.trim())) {
      current = [line]
      blocks.push(current)
      continue
    }
    if (current) current.push(line)
    else preamble.push(line)
  }

  const seen = new Set<string>()
  const days: string[] = []
  for (const block of blocks) {
    const key = weekdayKey(block[0] ?? '')
    if (seen.has(key)) continue
    seen.add(key)
    const tidied = tidyDay(block.join('\n'))
    if (tidied) days.push(tidied)
  }

  return [...preamble, ...days].join('\n').replace(/\n{3,}/g, '\n\n').trim()
}
