/**
 * Deterministic fixes after Claude writes a diet. Prompts are not enough for 95% —
 * repair the prose, then re-score. Used before calorie/preference safety throws.
 */
import type { GeneratedNutritionPlan } from '@/lib/ai/generate-plan'
import {
  dietScanOptionsFromProfile,
  enforceDietPreference,
  type DietPreferenceKind,
  type DietScanOptions,
} from '@/lib/ai/diet-preference-guard'
import { resolveClientCalorieTargets } from '@/lib/ai/calorie-targets'
import {
  getAuthoritativeNutritionCalories,
  inferMacrosFromDietText,
  syncNutritionPlanMacros,
} from '@/lib/ai/nutrition-macro-sync'
import { resolveDietFloorKcal } from '@/lib/ai/plan-quality-rules'

export type DietRepairProfile = {
  diet_preference?: string | null
  weight?: string | number | null
  height?: string | number | null
  age?: string | number | null
  gender?: string | null
  activity_level?: string | null
  fitness_goal?: string | null
  onboarding_data?: {
    diet?: {
      eggAllowedDays?: string[] | null
      chickenAllowedDays?: string[] | null
      fishAllowedDays?: string[] | null
      eggDaysPerWeek?: string | number | null
      chickenDaysPerWeek?: string | number | null
      fishDaysPerWeek?: string | number | null
      wheyProtein?: string | null
      allergies?: string | null
      foodsDisliked?: string | null
      customNotes?: string | null
    } | null
    eatingPattern?: {
      breakfast?: string | null
      lunch?: string | null
      dinner?: string | null
      snacks?: string | null
      timings?: {
        breakfast?: string | null
        lunch?: string | null
        dinner?: string | null
        snacks?: string | null
      } | null
    } | null
    training?: { daysPerWeek?: string | number | null } | null
  } | null
}

export type DietRepairResult = {
  plan: GeneratedNutritionPlan
  fixes: string[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function mapMealProse(plan: GeneratedNutritionPlan, fn: (text: string) => string): GeneratedNutritionPlan {
  return {
    ...plan,
    meals: plan.meals.map((meal) => {
      if (typeof meal === 'string') return fn(meal)
      if (!isRecord(meal)) return meal
      const next = { ...meal }
      for (const field of ['example', 'description', 'content', 'meal', 'foods', 'name'] as const) {
        const value = next[field]
        if (typeof value === 'string') next[field] = fn(value)
      }
      return next
    }),
  }
}

function collectProse(plan: GeneratedNutritionPlan): string {
  return plan.meals
    .map((meal) => {
      if (typeof meal === 'string') return meal
      if (!isRecord(meal)) return ''
      return [meal.example, meal.description, meal.content, meal.meal, meal.foods, meal.name]
        .filter((x): x is string => typeof x === 'string')
        .join('\n')
    })
    .join('\n\n')
}

function protectSafePhrases(text: string): { text: string; restore: (s: string) => string } {
  const tokens: string[] = []
  const text1 = text.replace(
    /\b(coconut|soy|soya|oat|almond|rice|cashew|pea)\s+milk\b/gi,
    (m) => {
      tokens.push(m)
      return `__SAFE_MILK_${tokens.length - 1}__`
    }
  )
  const text2 = text1.replace(/\b(peanut|almond|cashew|seed)\s+butter\b/gi, (m) => {
    tokens.push(m)
    return `__SAFE_BUTTER_${tokens.length - 1}__`
  })
  return {
    text: text2,
    restore: (s) =>
      s
        .replace(/__SAFE_MILK_(\d+)__/g, (_, i) => tokens[Number(i)] ?? '')
        .replace(/__SAFE_BUTTER_(\d+)__/g, (_, i) => tokens[Number(i)] ?? ''),
  }
}

function replaceWord(text: string, from: string, to: string): string {
  const escaped = from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return text.replace(new RegExp(`\\b${escaped}\\b`, 'gi'), to)
}

function swapAnimalCookingFat(text: string): string {
  const guarded = protectSafePhrases(text)
  let out = guarded.text
  out = replaceWord(out, 'ghee', 'mustard oil')
  out = replaceWord(out, 'butter', 'mustard oil')
  return guarded.restore(out)
}

function swapDairy(text: string): string {
  const guarded = protectSafePhrases(text)
  let out = guarded.text
  const swaps: Array<[string, string]> = [
    ['paneer bhurji', 'soya bhurji'],
    ['palak paneer', 'palak soya'],
    ['paneer', 'soya'],
    ['curd', 'salad'],
    ['dahi', 'salad'],
    ['yogurt', 'soy yogurt'],
    ['yoghurt', 'soy yogurt'],
    ['cheese', 'soya'],
    ['whey protein', 'soya chunks'],
    ['whey', 'soya chunks'],
    ['ice cream', 'frozen banana'],
    ['milkshake', 'banana smoothie'],
    ['lassi', 'coconut water'],
    ['buttermilk', 'coconut water'],
    ['chaas', 'coconut water'],
    ['casein', 'soya chunks'],
    ['khoya', 'soya'],
    ['mawa', 'soya'],
    ['rabri', 'date syrup'],
    ['malai', 'soya'],
    ['cream', 'coconut'],
    ['honey', 'date syrup'],
  ]
  for (const [from, to] of swaps) out = replaceWord(out, from, to)
  out = replaceWord(out, 'milk', 'soy milk')
  return guarded.restore(out)
}

function swapEggs(text: string): string {
  let out = text
  const swaps: Array<[string, string]> = [
    ['egg bhurji', 'soya bhurji'],
    ['bhurji egg', 'soya bhurji'],
    ['boiled eggs', 'roasted chana'],
    ['boiled egg', 'roasted chana'],
    ['omelette', 'besan chilla'],
    ['omelet', 'besan chilla'],
    ['eggs', 'dal'],
    ['egg', 'dal'],
    ['anda', 'dal'],
  ]
  for (const [from, to] of swaps) out = replaceWord(out, from, to)
  return out
}

function swapChicken(text: string): string {
  let out = text
  const swaps: Array<[string, string]> = [
    ['tandoori chicken', 'tandoori soya'],
    ['chicken curry', 'soya curry'],
    ['chicken biryani', 'veg pulao'],
    ['chicken', 'soya chunks'],
    ['murgh', 'soya chunks'],
    ['mutton', 'soya chunks'],
    ['keema', 'soya keema'],
    ['prawn', 'soya'],
    ['shrimp', 'soya'],
    ['kebab', 'soya tikka'],
    ['seafood', 'soya'],
    ['lamb', 'soya chunks'],
    ['beef', 'soya chunks'],
    ['pork', 'soya chunks'],
    ['bacon', 'soya'],
    ['ham', 'soya'],
    ['turkey', 'soya chunks'],
    ['meat', 'soya'],
  ]
  for (const [from, to] of swaps) out = replaceWord(out, from, to)
  return out
}

function swapFish(text: string): string {
  let out = text
  const swaps: Array<[string, string]> = [
    ['fish curry', 'dal tadka'],
    ['macher jhol', 'dal tadka'],
    ['macher', 'soya'],
    ['fish', 'soya'],
    ['salmon', 'soya'],
    ['tuna', 'chana'],
    ['rohu', 'soya'],
    ['pomfret', 'soya'],
    ['mackerel', 'soya'],
  ]
  for (const [from, to] of swaps) out = replaceWord(out, from, to)
  return out
}

function swapMeat(text: string): string {
  return swapFish(swapChicken(text))
}

function stripWheyServings(text: string): string {
  let out = text.replace(
    /[^\n]*\b(?:[0-9.]+\s*(?:scoop|scoops|g)\s+of\s+)?whey(?:\s+protein)?[^\n]*/gi,
    'Extra plate: 1 katori cooked dal (approx 150g).\n(P: 12g | C: 20g | F: 3g | ~150 kcal)'
  )
  out = replaceWord(out, 'whey protein', 'cooked dal')
  out = replaceWord(out, 'whey', 'cooked dal')
  return out
}

function swapGluten(text: string): string {
  let out = text
  const swaps: Array<[string, string]> = [
    ['wheat bread', 'idli'],
    ['wheat', 'rice'],
    ['paratha', 'poha'],
    ['parathas', 'poha'],
    ['chapati', 'rice'],
    ['chapatti', 'rice'],
    ['roti', 'rice'],
    ['rotis', 'rice'],
    ['naan', 'rice'],
    ['atta', 'rice'],
    ['bread', 'idli'],
  ]
  for (const [from, to] of swaps) out = replaceWord(out, from, to)
  return out
}

const DISLIKE_SWAPS: Array<[string, string]> = [
  ['bitter gourd', 'tinda'],
  ['karela', 'tinda'],
  ['mushrooms', 'capsicum'],
  ['mushroom', 'capsicum'],
  ['olives', 'cucumber'],
  ['olive', 'cucumber'],
  ['onions', 'cabbage'],
  ['onion', 'cabbage'],
  ['garlic', 'cumin'],
  ['potatoes', 'doodhi'],
  ['potato', 'doodhi'],
  ['aloo', 'doodhi'],
  ['carrots', 'cabbage'],
  ['carrot', 'cabbage'],
  ['beetroot', 'tinda'],
]

function swapDislikedFoods(text: string, disliked: string | null | undefined): string {
  if (!disliked?.trim() || /^none$/i.test(disliked.trim())) return text
  const lower = disliked.toLowerCase()
  let out = text
  for (const [from, to] of DISLIKE_SWAPS) {
    if (lower.includes(from) || /jain|no onion|no garlic|root vegetable/i.test(lower)) {
      out = replaceWord(out, from, to)
    }
  }
  // Jain / root-veg notes often live in custom notes, not the dislike string.
  return out
}

function swapJainRoots(text: string): string {
  let out = text
  for (const [from, to] of DISLIKE_SWAPS) {
    if (['onion', 'onions', 'garlic', 'potato', 'potatoes', 'aloo', 'carrot', 'carrots', 'beetroot'].includes(from)) {
      out = replaceWord(out, from, to)
    }
  }
  return out
}

const WEEKDAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const

export function fastingWeekdaysFromNotes(notes: string | null | undefined): string[] {
  if (!notes?.trim()) return []
  const lower = notes.toLowerCase()
  return WEEKDAYS.filter(
    (day) =>
      new RegExp(`fast(?:s|ing)?(?:\\s+every)?\\s+${day}`, 'i').test(lower) ||
      new RegExp(`${day}\\s+(?:fast|vrat)`, 'i').test(lower)
  )
}

const FASTING_LANGUAGE = /\b(?:fast(?:s|ing)?|vrat)\b|fruit and milk|till sunset/i

function isFastingDay(weekday: string, body: string, fastingWeekdays: string[]): boolean {
  if (weekday !== '*' && fastingWeekdays.includes(weekday)) return true
  return FASTING_LANGUAGE.test(body)
}

function fastingDayBlock(weekday: string): string {
  const label = weekday === '*' ? 'Fasting day' : `${weekday.charAt(0).toUpperCase()}${weekday.slice(1)}`
  return [
    `${label} fast (as requested).`,
    'Breakfast: fruit and milk till sunset.',
    '(P: 8g | C: 50g | F: 6g | ~280 kcal)',
    'Dinner: light sabzi and roti after sunset.',
    '(P: 12g | C: 60g | F: 6g | ~320 kcal)',
    'Daily Total: ~600 kcal | P: 20g | C: 110g | F: 12g',
  ].join('\n')
}

function swapNuts(text: string): string {
  let out = text
  const swaps: Array<[string, string]> = [
    ['peanut butter', 'roasted chana'],
    ['almond butter', 'roasted chana'],
    ['peanuts', 'roasted chana'],
    ['peanut', 'roasted chana'],
    ['almonds', 'roasted chana'],
    ['almond', 'roasted chana'],
    ['cashews', 'roasted chana'],
    ['cashew', 'roasted chana'],
    ['walnuts', 'roasted chana'],
    ['walnut', 'roasted chana'],
  ]
  for (const [from, to] of swaps) out = replaceWord(out, from, to)
  return out
}

function mapDayBlocks(text: string, fn: (weekday: string, body: string) => string): string {
  const re = /Day\s*(\d)\s*\(([^)]+)\)/gi
  const matches = [...text.matchAll(re)]
  if (matches.length === 0) return fn('*', text)
  let out = text.slice(0, matches[0]!.index ?? 0)
  for (let i = 0; i < matches.length; i++) {
    const match = matches[i]!
    const start = (match.index ?? 0) + match[0].length
    const end = i + 1 < matches.length ? matches[i + 1]!.index ?? text.length : text.length
    out += match[0] + fn((match[2] ?? '').trim().toLowerCase(), text.slice(start, end))
  }
  return out
}

function weekdayAllowed(allowed: string[] | null | undefined, weekday: string): boolean {
  const days = (allowed ?? []).map((d) => d.trim().toLowerCase()).filter(Boolean)
  if (days.length === 0) return true
  return days.includes(weekday)
}

function dayCountIsZero(value: string | number | null | undefined): boolean {
  if (value == null || value === '') return false
  const n = Number(value)
  return Number.isFinite(n) && n <= 0
}

function calorieFillBlock(opts: {
  vegan: boolean
  lactose: boolean
  gluten: boolean
  nutAllergy: boolean
  kcal: number
  slot?: string
}): string {
  const oil = opts.vegan || opts.lactose ? '2 tsp mustard oil' : '2 tsp oil'
  const protein = opts.vegan || opts.lactose ? '1 katori cooked dal and 40g soya chunks' : '1 katori cooked dal'
  const carb = opts.gluten ? '1 katori cooked rice (approx 180g)' : '2 rotis (approx 80g)'
  const snack = '1 banana'
  const slot = opts.slot ?? 'Evening snack'
  return [
    `${slot} (calorie fill): ${carb}, ${protein}, ${oil}, ${snack}.`,
    `(P: 20g | C: 60g | F: 12g | ~${opts.kcal} kcal)`,
  ].join('\n')
}

function bumpDailyTotalKcal(body: string, add: number): string {
  return body
    .split('\n')
    .map((line) => {
      if (!/daily\s+(?:total|totals|average)/i.test(line)) return line
      return line.replace(/(\d{3,4})(\s*kcal)/gi, (_, n: string, unit: string) => `${Number(n) + add}${unit}`)
    })
    .join('\n')
}

function stripOneCalorieFill(text: string, fastingWeekdays: string[]): string {
  return mapDayBlocks(text, (weekday, body) => {
    if (isFastingDay(weekday, body, fastingWeekdays)) return body
    const re = /(?:^|\n)[^\n]*\(calorie fill\):[^\n]*(?:\n\([^\n]*kcal\))?/gi
    const matches = [...body.matchAll(re)]
    const last = matches[matches.length - 1]
    if (!last || last.index == null) return body
    const kcalMatch = last[0].match(/(\d{3,4})\s*kcal/i)
    const removed = kcalMatch ? Number(kcalMatch[1]) : 0
    const next = `${body.slice(0, last.index)}${body.slice(last.index + last[0].length)}`
    return removed > 0 ? bumpDailyTotalKcal(next, -removed) : next
  })
}

function injectCalorieFill(
  text: string,
  perDayKcal: number,
  fill: string,
  fastingWeekdays: string[]
): string {
  const hasDays = /Day\s*\d\s*\(/i.test(text)
  if (!hasDays) {
    return `${text.trim()}\n\n${fill}\n`
  }
  return mapDayBlocks(text, (weekday, body) => {
    if (isFastingDay(weekday, body, fastingWeekdays)) return body
    const existing = (body.match(/calorie fill/gi) ?? []).length
    if (existing >= 4) return body
    const daily = body.search(/daily\s+(?:total|totals|average)/i)
    const next =
      daily >= 0
        ? `${body.slice(0, daily).trimEnd()}\n${fill}\n${body.slice(daily)}`
        : `${body.trimEnd()}\n${fill}\n`
    return bumpDailyTotalKcal(next, perDayKcal)
  })
}

function lifestyleKeywords(source: string): string[] {
  return source
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 4)
    .filter((w) => !['with', 'and', 'from', 'side', 'bowl', 'small', 'toast', 'black', 'skip', 'skips'].includes(w))
}

function timeVariants(raw: string): string[] {
  const t = raw.trim()
  const [hh, mm] = t.split(':')
  if (!hh || !mm) return [t]
  const h = Number(hh)
  const ampm = h === 0 ? 12 : h > 12 ? h - 12 : h
  const suffix = h >= 12 ? 'pm' : 'am'
  return [t, `${h}:${mm}`, `${ampm}:${mm}${suffix}`, `${ampm}:${mm} ${suffix}`, `${ampm}${suffix}`]
}

function planHasTime(text: string, time: string): boolean {
  const lower = text.toLowerCase()
  return timeVariants(time).some((v) => lower.includes(v.toLowerCase()))
}

function injectSlotLine(text: string, line: string, fastingWeekdays: string[]): string {
  if (!/Day\s*\d\s*\(/i.test(text)) {
    return `${text.trim()}\n\n${line}\n`
  }
  return mapDayBlocks(text, (weekday, body) => {
    if (isFastingDay(weekday, body, fastingWeekdays)) return body
    if (body.includes(line)) return body
    const daily = body.search(/daily\s+(?:total|totals|average)/i)
    if (daily >= 0) {
      return `${body.slice(0, daily).trimEnd()}\n${line}\n${body.slice(daily)}`
    }
    return `${body.trimEnd()}\n${line}\n`
  })
}

/** Put the client's usual snack/meal + clock time into the plan when Claude omitted them. */
function ensureLifestyleSlots(
  text: string,
  profile: DietRepairProfile,
  fastingWeekdays: string[]
): { text: string; fixes: string[] } {
  const eating = profile.onboarding_data?.eatingPattern
  if (!eating) return { text, fixes: [] }

  const slots: Array<{ food?: string | null; time?: string | null; label: string }> = [
    { food: eating.breakfast, time: eating.timings?.breakfast, label: 'Breakfast' },
    { food: eating.lunch, time: eating.timings?.lunch, label: 'Lunch' },
    { food: eating.dinner, time: eating.timings?.dinner, label: 'Dinner' },
    { food: eating.snacks, time: eating.timings?.snacks, label: 'Snack' },
  ]

  const fixes: string[] = []
  let out = text
  for (const slot of slots) {
    const food = slot.food?.trim()
    if (!food || /skip/i.test(food)) continue
    const keys = lifestyleKeywords(food)
    const foodMissing = keys.length > 0 && !keys.some((k) => new RegExp(`\\b${k}\\b`, 'i').test(out))
    const timeMissing = Boolean(slot.time?.trim()) && !planHasTime(out, slot.time!)
    if (!foodMissing && !timeMissing) continue
    const timeBit = slot.time?.trim() ? ` (${slot.time.trim()})` : ''
    const line = `${slot.label}${timeBit}: ${food}.`
    out = injectSlotLine(out, line, fastingWeekdays)
    fixes.push(`added missing ${slot.label.toLowerCase()} from lifestyle`)
  }
  return { text: out, fixes }
}

function ensureFastingLanguage(text: string, fastingWeekdays: string[]): string {
  if (fastingWeekdays.length === 0 && !FASTING_LANGUAGE.test(text)) return text
  return mapDayBlocks(text, (weekday, body) => {
    if (!isFastingDay(weekday, body, fastingWeekdays)) return body
    if (FASTING_LANGUAGE.test(body)) return body
    return `\n${fastingDayBlock(weekday)}\n`
  })
}

function repairProse(text: string, profile: DietRepairProfile, scan: DietScanOptions): { text: string; fixes: string[] } {
  const pref = (profile.diet_preference ?? '') as DietPreferenceKind
  const allergies = scan.allergies ?? ''
  const vegan = pref === 'vegan'
  const lactose = /lactose intolerant|lactose intolerance|dairy allergy/i.test(allergies)
  const gluten = /gluten allergy|celiac/i.test(allergies)
  const nutAllergy = /nut allergy/i.test(allergies)
  const fixes: string[] = []
  let out = text

  if (vegan || lactose) {
    const before = out
    out = swapAnimalCookingFat(out)
    if (out !== before) fixes.push(vegan ? 'ghee/butter → oil' : 'dairy fat → oil')
  }
  if (vegan || lactose) {
    const before = out
    out = swapDairy(out)
    if (out !== before) fixes.push(vegan ? 'dairy → plant foods' : 'lactose dairy removed')
  }
  if (pref === 'vegetarian' && !lactose) {
    const before = out
    out = replaceWord(out, 'tofu', 'paneer')
    if (out !== before) fixes.push('tofu → paneer')
  }
  if (pref === 'vegetarian' || pref === 'vegan') {
    const before = out
    out = swapEggs(out)
    out = swapMeat(out)
    if (out !== before) fixes.push('animal protein → dal/soya')
  } else if (pref === 'eggetarian') {
    const before = out
    out = swapMeat(out)
    if (out !== before) fixes.push('meat/fish → soya/dal')
  }

  if (pref === 'eggetarian' || pref === 'non_vegetarian') {
    const before = out
    out = mapDayBlocks(out, (weekday, body) => {
      let next = body
      const eggsOff = dayCountIsZero(scan.eggDaysPerWeek) || !weekdayAllowed(scan.eggAllowedDays, weekday)
      const chickenOff =
        dayCountIsZero(scan.chickenDaysPerWeek) || !weekdayAllowed(scan.chickenAllowedDays, weekday)
      const fishOff = dayCountIsZero(scan.fishDaysPerWeek) || !weekdayAllowed(scan.fishAllowedDays, weekday)
      if (eggsOff && weekday !== '*') next = swapEggs(next)
      if (chickenOff) next = swapChicken(next)
      if (fishOff) next = swapFish(next)
      return next
    })
    if (out !== before) fixes.push('weekday protein leaked onto veg days — swapped')
  }

  if (scan.wheyProtein === 'no') {
    const before = out
    out = stripWheyServings(out)
    if (out !== before) fixes.push('removed whey')
  }

  if (nutAllergy) {
    const before = out
    out = swapNuts(out)
    if (out !== before) fixes.push('nuts → roasted chana')
  }

  if (gluten) {
    const before = out
    out = swapGluten(out)
    if (out !== before) fixes.push('wheat/roti → rice/idli')
  }

  const disliked = profile.onboarding_data?.diet?.foodsDisliked
  const notes = profile.onboarding_data?.diet?.customNotes ?? ''
  const jain = /jain|no onion|no garlic|root vegetable/i.test(`${disliked ?? ''} ${notes}`)
  if (jain) {
    const before = out
    out = swapJainRoots(out)
    if (out !== before) fixes.push('jain roots removed')
  }
  if (disliked) {
    const before = out
    out = swapDislikedFoods(out, disliked)
    if (out !== before) fixes.push('disliked foods swapped')
  }

  return { text: out, fixes }
}

function toCalorieProfile(profile: DietRepairProfile): Parameters<typeof resolveClientCalorieTargets>[0] {
  return {
    weight: profile.weight ?? null,
    height: profile.height ?? null,
    age: profile.age ?? null,
    gender: profile.gender ?? null,
    activity_level: profile.activity_level ?? null,
    fitness_goal: profile.fitness_goal ?? null,
    onboarding_data: (profile.onboarding_data ?? null) as Parameters<
      typeof resolveClientCalorieTargets
    >[0]['onboarding_data'],
    sleep_duration: null,
    training_experience: null,
    injuries: null,
  }
}

/**
 * Fix lifestyle / preference / calorie leaks in a generated nutrition plan.
 * Safe to run on every successful draft before safety checks.
 */
export function applyDietPlanRepair(
  plan: GeneratedNutritionPlan,
  profile: DietRepairProfile
): DietRepairResult {
  const scan = dietScanOptionsFromProfile(profile)
  const fixes: string[] = []

  let next = mapMealProse(plan, (text) => {
    const repaired = repairProse(text, profile, scan)
    for (const f of repaired.fixes) {
      if (!fixes.includes(f)) fixes.push(f)
    }
    return repaired.text
  })

  const notes = profile.onboarding_data?.diet?.customNotes ?? ''
  const fastingWeekdays = fastingWeekdaysFromNotes(notes)
  next = mapMealProse(next, (text) => ensureFastingLanguage(text, fastingWeekdays))
  if (fastingWeekdays.length > 0) fixes.push('fasting weekday marked light')

  const targets = resolveClientCalorieTargets(toCalorieProfile(profile))
  const targetKcal = targets?.preferred ?? resolveDietFloorKcal(profile.weight)
  const allergies = scan.allergies ?? ''
  const fillOpts = {
    vegan: profile.diet_preference === 'vegan',
    lactose: /lactose intolerant|lactose intolerance|dairy allergy/i.test(allergies),
    gluten: /gluten allergy|celiac/i.test(allergies),
    nutAllergy: /nut allergy/i.test(allergies),
  }
  const calorieOpts = { skipWeekdays: fastingWeekdays }
  const fillSlots = ['Evening snack', 'Late snack', 'Snack', 'Mid-morning']

  for (let i = 0; i < 4; i++) {
    next = syncNutritionPlanMacros(next)
    const current = getAuthoritativeNutritionCalories(next, calorieOpts)
    const gap = targetKcal - current
    if (!(Number.isFinite(current) && current > 0 && gap > 80)) break
    const fillKcal = Math.min(450, Math.round(gap))
    const fill = calorieFillBlock({
      ...fillOpts,
      kcal: fillKcal,
      slot: fillSlots[i] ?? 'Snack',
    })
    next = mapMealProse(next, (text) => injectCalorieFill(text, fillKcal, fill, fastingWeekdays))
    fixes.push(`calorie fill +~${fillKcal} kcal/day to reach ${targetKcal}`)
  }

  for (let i = 0; i < 4; i++) {
    next = syncNutritionPlanMacros(next)
    const current = getAuthoritativeNutritionCalories(next, calorieOpts)
    if (!(Number.isFinite(current) && current > targetKcal + 120)) break
    let stripped = false
    next = mapMealProse(next, (text) => {
      const out = stripOneCalorieFill(text, fastingWeekdays)
      if (out !== text) stripped = true
      return out
    })
    if (!stripped) break
    fixes.push('calorie trim back to Mifflin target')
  }

  next = mapMealProse(next, (text) => {
    const lifestyle = ensureLifestyleSlots(text, profile, fastingWeekdays)
    for (const f of lifestyle.fixes) {
      if (!fixes.includes(f)) fixes.push(f)
    }
    return lifestyle.text
  })

  next = syncNutritionPlanMacros(next)

  return { plan: next, fixes }
}

/** True when repair made the plan pass preference + calorie target (or it already did). */
export function dietPlanMeetsContract(
  plan: GeneratedNutritionPlan,
  profile: DietRepairProfile
): boolean {
  const scan = dietScanOptionsFromProfile(profile)
  const preference = enforceDietPreference(plan, profile.diet_preference, scan)
  if (!preference.ok) return false
  const targets = resolveClientCalorieTargets(toCalorieProfile(profile))
  const target = targets?.preferred ?? resolveDietFloorKcal(profile.weight)
  const skipWeekdays = fastingWeekdaysFromNotes(profile.onboarding_data?.diet?.customNotes)
  const cals = getAuthoritativeNutritionCalories(plan, { skipWeekdays })
  if (!Number.isFinite(cals) || cals <= 0) return inferMacrosFromDietText(collectProse(plan)) == null
  return cals >= target - 100 && cals <= target + 150
}
