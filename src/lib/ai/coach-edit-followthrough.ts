import {
  extractStepCount,
  formatStepsOnlyCardio,
  isStepsOnlyCardioPlan,
} from '@/lib/ai/cardio-steps'

type Section = 'nutrition' | 'workout' | 'cardio'

const FOOD_ALIASES: Record<string, string[]> = {
  chicken: ['chicken'],
  egg: ['egg', 'omelette', 'omelet'],
  paneer: ['paneer'],
  soy: ['soy', 'soya', 'tofu', 'tempeh'],
  soya: ['soy', 'soya', 'tofu', 'tempeh'],
  tofu: ['tofu', 'tempeh', 'soya', 'soy'],
  tempeh: ['tempeh', 'tofu'],
  mushroom: ['mushroom'],
  olive: ['olive'],
  whey: ['whey'],
  onion: ['onion'],
  garlic: ['garlic'],
  potato: ['potato', 'aloo'],
  aloo: ['potato', 'aloo'],
  carrot: ['carrot'],
  beetroot: ['beetroot', 'beet'],
}

const STOP = new Set([
  'the',
  'all',
  'any',
  'and',
  'from',
  'please',
  'this',
  'week',
  'client',
  'asked',
  'told',
  'want',
  'wants',
  'dont',
  'does',
  'not',
  'use',
  'for',
  'dal',
  'chana',
  'instead',
  'everywhere',
  'request',
  'keep',
])

const SWAP: Record<string, string> = {
  chicken: 'dal',
  egg: 'poha',
  omelette: 'poha',
  omelet: 'poha',
  paneer: 'dal',
  soy: 'dal',
  soya: 'dal',
  tofu: 'chana',
  tempeh: 'chana',
  mushroom: 'cabbage',
  olive: 'cucumber',
  whey: 'dal',
  onion: 'cabbage',
  garlic: 'ginger',
  potato: 'lauki',
  aloo: 'lauki',
  carrot: 'beans',
  beetroot: 'beans',
  beet: 'beans',
}

function weekdaySlices(text: string): Map<string, string> {
  const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
  const lower = text.toLowerCase()
  const hits: { day: string; index: number }[] = []
  for (const day of days) {
    const idx = lower.search(new RegExp(`\\b${day}\\b`))
    if (idx >= 0) hits.push({ day, index: idx })
  }
  hits.sort((a, b) => a.index - b.index)
  const map = new Map<string, string>()
  for (let i = 0; i < hits.length; i++) {
    const start = hits[i]!.index
    const end = i + 1 < hits.length ? hits[i + 1]!.index : text.length
    map.set(hits[i]!.day, text.slice(start, end))
  }
  return map
}

function expandFood(word: string): string[] {
  const key = word.toLowerCase().replace(/s$/, '')
  return FOOD_ALIASES[key] ?? FOOD_ALIASES[word.toLowerCase()] ?? [key]
}

function collectFoodsFromChunk(chunk: string, into: string[]): void {
  const cleaned = chunk.toLowerCase().replace(/\s+(and|&|or)\s+/g, ' ')
  for (const part of cleaned.split(/[\s,/]+/)) {
    const word = part.trim()
    if (word.length < 3 || STOP.has(word)) continue
    into.push(...expandFood(word))
  }
}

export function dietRemovalTargets(instruction: string): string[] {
  const found: string[] = []
  const reTight =
    /(?:remove|no more|without|drop|cut out|eliminate|please no|don't want|do not want|doesn't want|does not want|can't do|cannot have|allergic to|asked to (?:drop|remove)|told (?:you|me|the coach) to (?:drop|remove)|avoid|\bno)\s+([a-z][a-z\s,]{1,60}?)(?=\s+(?:from|on|in|for|this|everywhere|swap|use|tue|thu|monday|tuesday|wednesday|thursday|friday|saturday|sunday|diet|workout)|[.]|$)/gi
  let match: RegExpExecArray | null
  while ((match = reTight.exec(instruction)) !== null) {
    collectFoodsFromChunk(match[1]!, found)
  }
  if (/jain|\bno onion\b|\bno garlic\b|root vegetables?|\bno root\b/i.test(instruction)) {
    found.push('onion', 'garlic', 'potato', 'aloo', 'carrot', 'beetroot')
  }
  return [...new Set(found)]
}

export function mentionedWeekdays(instruction: string): string[] {
  const days = new Set<string>()
  const aliases: Record<string, string> = {
    mon: 'monday',
    tue: 'tuesday',
    tues: 'tuesday',
    wed: 'wednesday',
    thu: 'thursday',
    thur: 'thursday',
    thurs: 'thursday',
    fri: 'friday',
    sat: 'saturday',
    sun: 'sunday',
  }
  const re = new RegExp(
    `\\b(${[...Object.keys(aliases), 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].join('|')})\\b`,
    'gi'
  )
  let match: RegExpExecArray | null
  while ((match = re.exec(instruction)) !== null) {
    const key = match[1]!.toLowerCase()
    days.add(aliases[key] ?? key)
  }
  return [...days]
}

function countWord(haystack: string, word: string): number {
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const re = new RegExp(`\\b${escaped}s?\\b`, 'gi')
  return haystack.match(re)?.length ?? 0
}

export function foodsPresentInDiet(
  diet: string,
  foods: string[],
  weekdays?: string[]
): string[] {
  const slices = weekdaySlices(diet)
  const bodies =
    weekdays && weekdays.length > 0
      ? weekdays.map((d) => slices.get(d) ?? '').filter(Boolean)
      : [diet]
  const scan = bodies.join('\n')
  const hits: string[] = []
  for (const food of foods) {
    for (const alias of expandFood(food)) {
      if (countWord(scan, alias) > 0) hits.push(alias)
    }
  }
  return [...new Set(hits)]
}

export function instructionSkipsBreakfast(instruction: string): boolean {
  return /skip breakfast|no breakfast|does not eat breakfast|first meal is lunch|no calories before|16\s*:\s*8/i.test(
    instruction
  )
}

export function instructionSkipsLunch(instruction: string): boolean {
  return /skip lunch|no lunch|sleeps through lunch|do not add lunch/i.test(instruction)
}

function breakfastStillServed(diet: string): boolean {
  const lines = diet.split('\n')
  return lines.some((line) => {
    if (!/breakfast/i.test(line)) return false
    return !/skip|fast|none|n\/a|no breakfast/i.test(line)
  })
}

function lunchStillServed(diet: string): boolean {
  const lines = diet.split('\n')
  return lines.some((line) => {
    if (!/\blunch\b/i.test(line)) return false
    return !/skip|sleep|none|n\/a|no lunch/i.test(line)
  })
}

function replaceFoodsInText(text: string, foods: string[]): string {
  let out = text
  for (const food of foods) {
    const swap = SWAP[food] ?? 'dal'
    const escaped = food.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    out = out.replace(new RegExp(`\\b${escaped}s?\\b`, 'gi'), swap)
  }
  return out
}

function rewriteSkippedMeal(text: string, meal: 'breakfast' | 'lunch', label: string): string {
  const re = new RegExp(`^([^\\n]*${meal}[^\\n]*)$`, 'gim')
  return text.replace(re, `${meal[0]!.toUpperCase()}${meal.slice(1)}: ${label}`)
}

/** Deterministic mock/helper: apply standing + current diet instructions onto plan text. */
export function applyCoachDietEditsToText(current: string, instruction: string): string {
  let out = current.trim()
  if (!out) return out
  const foods = dietRemovalTargets(instruction)
  const weekdays = mentionedWeekdays(instruction)
  if (foods.length > 0) {
    if (weekdays.length === 0) {
      out = replaceFoodsInText(out, foods)
    } else {
      const slices = weekdaySlices(out)
      for (const day of weekdays) {
        const body = slices.get(day)
        if (!body) continue
        out = out.replace(body, replaceFoodsInText(body, foods))
      }
    }
  }
  if (instructionSkipsBreakfast(instruction)) {
    out = rewriteSkippedMeal(out, 'breakfast', 'skipped (fasting window)')
  }
  if (instructionSkipsLunch(instruction)) {
    out = rewriteSkippedMeal(out, 'lunch', 'skipped (sleep / shift)')
  }
  return out
}

/** Retry hint when the model ignored a concrete coach instruction. */
export function coachEditFollowthroughHint(
  section: Section,
  instruction: string,
  revised: string
): string | null {
  const ask = instruction.trim()
  if (!ask) return null

  if (section === 'cardio') {
    const wanted = extractStepCount(ask)
    if (wanted != null && extractStepCount(revised) !== wanted) {
      return `Write only "${formatStepsOnlyCardio(wanted)}". No other text.`
    }
    if (!isStepsOnlyCardioPlan(revised)) {
      return 'Write only the daily step count on one line, e.g. "8000 steps". No LISS, HIIT, or extra notes.'
    }
    return null
  }

  if (section !== 'nutrition') return null

  if (instructionSkipsBreakfast(ask) && breakfastStillServed(revised)) {
    return 'The client skips breakfast. Do not write a breakfast meal. Keep lunch as the first meal.'
  }
  if (instructionSkipsLunch(ask) && lunchStillServed(revised)) {
    return 'The client skips lunch. Do not write a lunch meal on those days.'
  }

  const targets = dietRemovalTargets(ask)
  const weekdays = mentionedWeekdays(ask)
  if (targets.length === 0) return null

  const leftovers = foodsPresentInDiet(revised, targets, weekdays.length ? weekdays : undefined)
  if (leftovers.length === 0) return null
  const where = weekdays.length ? ` on ${weekdays.join(' and ')}` : ''
  return `The instruction required removing ${leftovers.join(', ')}${where}. Those items are still in the plan. Remove them and keep every other day the same. Honor standing coach requests and the client's diet preference, allergies, and dislikes.`
}

export function namedWeekdaysInInstruction(instruction: string): string[] {
  return mentionedWeekdays(instruction)
}
