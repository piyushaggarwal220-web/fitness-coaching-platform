/**
 * A weekly diet was shipping as a repeat of the old chart, with the client's
 * food request left out and the printed numbers disagreeing with the meals.
 */

const FOODS = [
  'paneer',
  'chicken',
  'egg',
  'eggs',
  'rice',
  'roti',
  'oats',
  'oat',
  'whey',
  'dal',
  'milk',
  'curd',
  'fish',
  'mutton',
  'bread',
  'potato',
  'banana',
  'peanut',
  'almond',
  'ghee',
  'soya',
  'tofu',
  'pasta',
  'dahi',
  'yogurt',
  'cheese',
]

const REMOVE_VERB =
  /\b(?:no|not|don't|dont|do not|without|remove|drop|skip|hate|avoid|stop|can't have|cannot have|allergic)\b/i
const ADD_VERB = /\b(?:add|include|want|wants|need|needs|more|extra|instead|swap|switch|prefer)\b/i

function canonicalFood(food: string): string {
  if (food === 'eggs') return 'egg'
  if (food === 'oat') return 'oats'
  return food
}

function foodsIn(text: string): Set<string> {
  const found = new Set<string>()
  const lower = text.toLowerCase()
  for (const food of FOODS) {
    if (new RegExp(`\\b${food}\\b`, 'i').test(lower)) found.add(canonicalFood(food))
  }
  return found
}

function foodsInSentences(text: string, verb: RegExp): string[] {
  const found = new Set<string>()
  for (const sentence of text.split(/[.\n]/)) {
    if (!verb.test(sentence)) continue
    for (const food of foodsIn(sentence)) found.add(food)
  }
  return [...found]
}

export function dietChangeFoods(requestText: string): { add: string[]; remove: string[] } {
  const remove = new Set(foodsInSentences(requestText, REMOVE_VERB))
  for (const sentence of requestText.split(/[.\n]/)) {
    const match = sentence.match(/\binstead of\s+([a-z]+)/i)
    if (!match) continue
    const food = canonicalFood(match[1].toLowerCase())
    if (FOODS.includes(match[1].toLowerCase()) || FOODS.includes(food)) remove.add(food)
  }
  const add = foodsInSentences(requestText, ADD_VERB).filter((food) => !remove.has(food))
  return { add, remove: [...remove] }
}

function meaningful(value: string | null | undefined): boolean {
  const text = value?.trim()
  if (!text) return false
  return !/^(none|n\/a|na|no|nil|-)$/i.test(text)
}

/** True only when the check-in actually asks to change food. A workout note must not rewrite the diet. */
export function clientRequestedDietChange(checkin: {
  progress_notes?: string | null
  notes?: string | null
  questions_for_coach?: string | null
  adherence_struggles?: string | null
  digestion?: string | null
}): boolean {
  const change =
    /\b(add|remove|drop|swap|switch|instead|hate|avoid|skip|hungry|hunger|bloated|not enough|too (?:much|little|high|low)|more|less|extra|change|don'?t like|can'?t eat|allergic|stop eating|without)\b/i
  const food =
    /\b(diet|meal|meals|food|calorie|calories|protein|breakfast|lunch|dinner|snack|roti|rice|paneer|chicken|egg|eggs|whey|vegetarian|portion|recipe)\b/i
  const blob = [
    checkin.progress_notes,
    checkin.notes,
    checkin.questions_for_coach,
    checkin.adherence_struggles,
  ]
    .filter((text) => meaningful(text))
    .join('\n')
  if (/\b(hungry|hunger|bloated)\b/i.test(blob)) return true
  if (change.test(blob) && food.test(blob)) return true
  const digestion = checkin.digestion?.trim() ?? ''
  if (digestion && !/^(none|n\/a|na|no|nil|fine|ok|okay|good|normal|-)$/i.test(digestion)) return true
  return false
}

/**
 * Null when the new diet honours the request.
 * A problem string when a named food was not added or removed.
 */
export function assessDietFollowsRequest(
  nextDiet: string,
  requestText: string,
  _previousDiet?: string | null
): string | null {
  const request = requestText.trim()
  if (!request) return null
  const { add, remove } = dietChangeFoods(request)
  const nextFoods = foodsIn(nextDiet)
  const missedRemove = remove.filter((food) => nextFoods.has(food))
  const missedAdd = add.filter((food) => !nextFoods.has(food))
  if (missedRemove.length > 0) {
    return `Diet still includes ${missedRemove.join(', ')} after the client asked to take it out.`
  }
  if (missedAdd.length > 0) {
    return `Diet never added ${missedAdd.join(', ')} even though the client asked for it.`
  }
  return null
}
