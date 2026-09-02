/**
 * Scan diet prose for foods forbidden by diet preference, allowed-weekday protein,
 * whey-when-no, and hard allergies. Used after generation to reject/retry.
 */

export type DietPreferenceKind =
  | 'vegetarian'
  | 'vegan'
  | 'eggetarian'
  | 'non_vegetarian'
  | string
  | null
  | undefined

export type DietPreferenceViolation = {
  term: string
  category: string
}

export type DietPreferenceSafetyResult =
  | { ok: true }
  | { ok: false; error: string; hint: string; violations: DietPreferenceViolation[] }

export type DietScanOptions = {
  extraProse?: string | null
  eggAllowedDays?: string[] | null
  chickenAllowedDays?: string[] | null
  fishAllowedDays?: string[] | null
  eggDaysPerWeek?: string | number | null
  chickenDaysPerWeek?: string | number | null
  fishDaysPerWeek?: string | number | null
  wheyProtein?: string | null
  allergies?: string | null
}

type DietScanProfile = {
  diet_preference?: string | null
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
    } | null
  } | null
}

/** Word-boundary scan; short tokens use \b to avoid false positives (e.g. eggplant). */
function findTerms(text: string, terms: string[]): string[] {
  // Neutralize vegan-safe phrases that contain banned substrings.
  let lower = text
    .toLowerCase()
    .replace(/\b(coconut|soy|soya|oat|almond|rice|cashew|pea)\s+milk\b/gi, 'plantmilk')
    .replace(/\b(peanut|almond|cashew|seed)\s+butter\b/gi, 'nutbutter')
  const hits: string[] = []
  for (const term of terms) {
    const t = term.toLowerCase().trim()
    if (!t) continue
    const escaped = t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    // Always use word boundaries so "butter" does not match "nutbutter" / "peanut butter".
    const re = new RegExp(`\\b${escaped}\\b`, 'i')
    if (re.test(lower)) hits.push(t)
  }
  return [...new Set(hits)]
}

/** Strip "no X / avoid X / never X" so restated bans are not treated as servings. */
function neutralizeProhibitions(text: string, terms: string[]): string {
  let out = text
  for (const term of terms) {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    out = out.replace(
      new RegExp(
        `\\b(?:no|not|never|avoid|skip|without|zero)\\s+(?:any\\s+)?(?:use\\s+|write\\s+|include\\s+|using\\s+)?${escaped}\\b`,
        'gi'
      ),
      ' '
    )
    out = out.replace(
      new RegExp(`\\b${escaped}\\s+(?:is\\s+|are\\s+)?(?:not|never)\\s+(?:allowed|used|included|eaten)`, 'gi'),
      ' '
    )
  }
  return out
}

const MEAT_SEAFOOD = [
  'chicken',
  'mutton',
  'lamb',
  'beef',
  'pork',
  'bacon',
  'ham',
  'turkey',
  'prawn',
  'shrimp',
  'fish',
  'salmon',
  'tuna',
  'rohu',
  'pomfret',
  'mackerel',
  'seafood',
  'meat',
  'keema',
  'kebab',
  'tandoori chicken',
]

const EGG_TERMS = ['egg', 'eggs', 'omelette', 'omelet', 'bhurji egg', 'egg bhurji', 'boiled egg', 'anda']

const CHICKEN_TERMS = ['chicken', 'murgh', 'tandoori chicken']

const FISH_TERMS = ['fish', 'macher', 'rohu', 'pomfret', 'salmon', 'tuna', 'mackerel']

const DAIRY_TERMS = [
  'ghee',
  'butter',
  'paneer',
  'curd',
  'dahi',
  'yogurt',
  'yoghurt',
  'cheese',
  'milk',
  'whey',
  'casein',
  'cream',
  'malai',
  'lassi',
  'chaas',
  'buttermilk',
  'khoya',
  'mawa',
  'rabri',
  'ice cream',
]

const LACTOSE_TERMS = [
  'paneer',
  'curd',
  'dahi',
  'yogurt',
  'yoghurt',
  'cheese',
  'whey',
  'milkshake',
  'lassi',
  'chaas',
  'buttermilk',
]

const NUT_TERMS = ['peanut', 'peanuts', 'almond', 'almonds', 'cashew', 'cashews', 'walnut', 'walnuts']

const GLUTEN_TERMS = ['roti', 'paratha', 'chapati', 'chapatti', 'atta', 'naan', 'wheat', 'wheat bread']

const HONEY_TERMS = ['honey']

const ANIMAL_COOKING_FAT = ['ghee', 'butter']

function mealProseFromPlan(plan: {
  meals?: unknown
  calories?: number
}): string {
  const meals = plan.meals
  if (!Array.isArray(meals)) return ''
  return meals
    .map((m) => {
      if (typeof m === 'string') return m
      if (!m || typeof m !== 'object') return ''
      const row = m as Record<string, unknown>
      return [row.meal, row.example, row.foods, row.description, row.content, row.name]
        .filter((x) => typeof x === 'string')
        .join('\n')
    })
    .join('\n')
}

function normalizeWeekdays(days: string[] | null | undefined): string[] {
  return (days ?? []).map((d) => d.trim().toLowerCase()).filter(Boolean)
}

function dayCountIsZero(value: string | number | null | undefined): boolean {
  if (value == null || value === '') return false
  const n = Number(value)
  return Number.isFinite(n) && n <= 0
}

function splitDayBlocks(dietText: string): Array<{ weekday: string; body: string }> {
  const re = /Day\s*(\d)\s*\(([^)]+)\)/gi
  const matches = [...dietText.matchAll(re)]
  const out: Array<{ weekday: string; body: string }> = []
  for (let i = 0; i < matches.length; i++) {
    const match = matches[i]!
    const start = (match.index ?? 0) + match[0].length
    const end = i + 1 < matches.length ? matches[i + 1]!.index ?? dietText.length : dietText.length
    out.push({
      weekday: (match[2] ?? '').trim().toLowerCase(),
      body: dietText.slice(start, end),
    })
  }
  return out
}

function findWeekdayProteinViolations(text: string, opts: DietScanOptions): DietPreferenceViolation[] {
  const days = splitDayBlocks(text)
  if (days.length === 0) return []

  const eggDays = normalizeWeekdays(opts.eggAllowedDays)
  const chickenDays = normalizeWeekdays(opts.chickenAllowedDays)
  const fishDays = normalizeWeekdays(opts.fishAllowedDays)
  const violations: DietPreferenceViolation[] = []

  const scanKind = (
    kind: 'eggs' | 'chicken' | 'fish',
    allowed: string[],
    never: boolean,
    terms: string[]
  ) => {
    if (!never && allowed.length === 0) return
    for (const d of days) {
      if (!never && allowed.includes(d.weekday)) continue
      const body = neutralizeProhibitions(d.body, terms)
      const hits = findTerms(body, terms)
      for (const term of hits) {
        violations.push({ term: `${d.weekday}:${term}`, category: `${kind}-weekday` })
      }
    }
  }

  scanKind('eggs', eggDays, dayCountIsZero(opts.eggDaysPerWeek), EGG_TERMS)
  scanKind('chicken', chickenDays, dayCountIsZero(opts.chickenDaysPerWeek), CHICKEN_TERMS)
  scanKind('fish', fishDays, dayCountIsZero(opts.fishDaysPerWeek), FISH_TERMS)
  return violations
}

function findWheyWhenNoViolations(text: string, wheyProtein: string | null | undefined): DietPreferenceViolation[] {
  if (wheyProtein !== 'no') return []
  const scanned = neutralizeProhibitions(text, ['whey', 'whey protein'])
  if (!/\bwhey\b/i.test(scanned)) return []
  return [{ term: 'whey', category: 'whey' }]
}

function findAllergyViolations(text: string, allergies: string | null | undefined): DietPreferenceViolation[] {
  if (!allergies?.trim() || /^none$/i.test(allergies.trim())) return []
  const violations: DietPreferenceViolation[] = []
  const add = (terms: string[], category: string, raw = text) => {
    const scanned = neutralizeProhibitions(raw, terms)
    for (const term of findTerms(scanned, terms)) {
      violations.push({ term, category })
    }
  }

  if (/lactose intolerant|lactose intolerance|dairy allergy/i.test(allergies)) {
    add(LACTOSE_TERMS, 'lactose')
  }
  if (/gluten allergy|celiac/i.test(allergies)) {
    add(GLUTEN_TERMS, 'gluten')
  }
  if (/nut allergy/i.test(allergies)) {
    // Do not neutralize "peanut butter" — that is the allergen.
    const scanned = neutralizeProhibitions(text, NUT_TERMS)
    for (const term of NUT_TERMS) {
      const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      if (new RegExp(`\\b${escaped}\\b`, 'i').test(scanned)) {
        violations.push({ term, category: 'nuts' })
      }
    }
  }
  return violations
}

/**
 * Find preference violations in client-facing diet text.
 */
export function findDietPreferenceViolations(
  text: string,
  preference: DietPreferenceKind
): DietPreferenceViolation[] {
  if (!text?.trim() || !preference) return []

  const violations: DietPreferenceViolation[] = []
  const add = (terms: string[], category: string) => {
    for (const term of findTerms(text, terms)) {
      violations.push({ term, category })
    }
  }

  if (preference === 'vegetarian') {
    add(MEAT_SEAFOOD, 'meat/seafood')
    add(EGG_TERMS, 'eggs')
  } else if (preference === 'vegan') {
    add(MEAT_SEAFOOD, 'meat/seafood')
    add(EGG_TERMS, 'eggs')
    add(DAIRY_TERMS, 'dairy')
    add(HONEY_TERMS, 'honey')
  } else if (preference === 'eggetarian') {
    add(MEAT_SEAFOOD, 'meat/seafood')
  }

  return violations
}

export function dietScanOptionsFromProfile(profile: DietScanProfile | null | undefined): DietScanOptions {
  const diet = profile?.onboarding_data?.diet
  return {
    eggAllowedDays: diet?.eggAllowedDays ?? null,
    chickenAllowedDays: diet?.chickenAllowedDays ?? null,
    fishAllowedDays: diet?.fishAllowedDays ?? null,
    eggDaysPerWeek: diet?.eggDaysPerWeek ?? null,
    chickenDaysPerWeek: diet?.chickenDaysPerWeek ?? null,
    fishDaysPerWeek: diet?.fishDaysPerWeek ?? null,
    wheyProtein: diet?.wheyProtein ?? null,
    allergies: diet?.allergies ?? null,
  }
}

/** Foods to enlarge on a calorie-floor retry — never dairy/ghee for vegan or lactose-intolerant clients. */
export function calorieBumpFoodsForProfile(profile: DietScanProfile | null | undefined): string {
  const pref = profile?.diet_preference
  const allergies = profile?.onboarding_data?.diet?.allergies ?? ''
  const lactose = /lactose intolerant|lactose intolerance|dairy allergy/i.test(allergies)
  const gluten = /gluten allergy|celiac/i.test(allergies)
  if (pref === 'vegan' || lactose) {
    if (gluten) {
      return 'rice, idli, poha, dal, soya, peanuts, snacks, and cooking oil (never ghee, butter, paneer, curd, roti, wheat, or whey)'
    }
    return 'roti, rice, dal, soya, peanuts, snacks, and cooking oil (never ghee, butter, paneer, curd, dairy, or whey)'
  }
  if (gluten) {
    return 'rice, idli, poha, dal, paneer, snacks, oil (never roti, paratha, atta, or wheat bread)'
  }
  return 'roti, rice, dal, paneer, snacks, oil/ghee'
}

function buildRewriteHint(
  preference: DietPreferenceKind,
  violations: DietPreferenceViolation[],
  opts: DietScanOptions
): string {
  const categories = new Set(violations.map((v) => v.category))
  const parts: string[] = []

  if (preference === 'vegan' && (categories.has('dairy') || categories.has('honey') || categories.has('eggs') || categories.has('meat/seafood'))) {
    parts.push(
      'VEGAN REWRITE REQUIRED: Remove ALL animal products. Banned: ghee, butter, milk, curd/dahi, yogurt, paneer, cheese, cream, whey, honey, eggs, meat, fish. Cooking fat: oil only. Protein: dal, soya chunks, tofu, chana, rajma, peanuts — never dairy. Keep calories at or above the floor with rice, roti, oil, and soya.'
    )
  } else if (preference === 'vegetarian' && (categories.has('eggs') || categories.has('meat/seafood'))) {
    parts.push(
      'VEGETARIAN REWRITE REQUIRED: Remove eggs, chicken, fish, mutton, prawn, and all meat/seafood. Use dal, paneer, soya, chana, curd, nuts unless allergy forbids dairy.'
    )
  } else if (preference === 'eggetarian' && categories.has('meat/seafood')) {
    parts.push(
      'EGGETARIAN REWRITE REQUIRED: Remove chicken, fish, mutton, prawn, and all meat/seafood. Eggs only on allowed weekdays from Hard Constraints.'
    )
  }

  if (categories.has('eggs-weekday') || categories.has('chicken-weekday') || categories.has('fish-weekday')) {
    const egg = normalizeWeekdays(opts.eggAllowedDays)
    const chicken = normalizeWeekdays(opts.chickenAllowedDays)
    const fish = normalizeWeekdays(opts.fishAllowedDays)
    parts.push(
      [
        'WEEKDAY PROTEIN REWRITE: Animal protein leaked onto a veg-only day.',
        egg.length ? `Eggs only on ${egg.join(', ')}.` : dayCountIsZero(opts.eggDaysPerWeek) ? 'No eggs any day.' : null,
        chicken.length
          ? `Chicken only on ${chicken.join(', ')}.`
          : dayCountIsZero(opts.chickenDaysPerWeek)
            ? 'No chicken any day.'
            : null,
        fish.length ? `Fish only on ${fish.join(', ')}.` : dayCountIsZero(opts.fishDaysPerWeek) ? 'No fish any day.' : null,
        'On every other weekday use dal, soya, paneer (if allowed), or the allowed protein for that day. Sunday is not a free-for-all.',
      ]
        .filter(Boolean)
        .join(' ')
    )
  }

  if (categories.has('whey')) {
    parts.push('WHEY REWRITE: This client does not use whey. Delete every whey scoop, whey shake, and the word whey. Use food protein only.')
  }
  if (categories.has('lactose')) {
    parts.push(
      'LACTOSE REWRITE: Remove paneer, curd, dahi, yogurt, cheese, whey, lassi, buttermilk. Use dal, soya, chana, rice, roti, oil. Raise calories with oil and soya, not dairy.'
    )
  }
  if (categories.has('gluten')) {
    parts.push('GLUTEN REWRITE: Remove roti, paratha, chapati, atta, naan, wheat bread. Use rice, idli, poha, dal.')
  }
  if (categories.has('nuts')) {
    parts.push('NUT ALLERGY REWRITE: Remove peanut, almond, cashew, walnut, and nut butters. Use roasted chana, fruit, dal.')
  }

  return parts.join(' ')
}

export function enforceDietPreference(
  plan: { meals?: unknown; calories?: number },
  preference: DietPreferenceKind,
  opts?: DietScanOptions
): DietPreferenceSafetyResult {
  const options = opts ?? {}
  const prose = [mealProseFromPlan(plan), options.extraProse ?? ''].filter(Boolean).join('\n')
  if (!prose.trim()) return { ok: true }

  const violations = [
    ...findDietPreferenceViolations(prose, preference),
    ...findWeekdayProteinViolations(prose, options),
    ...findWheyWhenNoViolations(prose, options.wheyProtein),
    ...findAllergyViolations(prose, options.allergies),
  ]
  if (violations.length === 0) return { ok: true }

  const terms = [...new Set(violations.map((v) => v.term))]
  const categories = [...new Set(violations.map((v) => v.category))]

  return {
    ok: false,
    error: `Diet preference (${preference || 'unspecified'}) violated by: ${terms.join(', ')} (${categories.join(', ')}).`,
    hint: buildRewriteHint(preference, violations, options),
    violations,
  }
}

/** Explicit banned lists for prompts (human-readable). */
export function dietPreferenceBannedListForPrompt(preference: DietPreferenceKind): string | null {
  if (preference === 'vegan') {
    return [
      'VEGAN BANNED FOODS (never write any of these, including cooking fats and swaps):',
      'ghee, butter, milk, curd, dahi, yogurt, yoghurt, paneer, cheese, cream, malai, lassi, chaas, buttermilk, khoya, whey, casein, honey, egg, eggs, omelette, chicken, fish, mutton, prawn, meat, seafood.',
      'VEGAN COOKING FAT: oil only (mustard / groundnut / coconut / olive). Never "1 tsp ghee" or "1 tsp butter".',
      'VEGAN PROTEIN: dal, soya chunks, tofu, chana, rajma, peanuts, peanut butter, sprouts — never dairy protein.',
    ].join('\n')
  }
  if (preference === 'vegetarian') {
    return [
      'VEGETARIAN BANNED FOODS (never write any of these, including swaps):',
      'egg, eggs, omelette, omelet, chicken, fish, mutton, prawn, meat, seafood, salmon, tuna.',
      'Allowed animal-adjacent: dairy only (paneer, curd, milk, ghee) unless allergy forbids.',
    ].join('\n')
  }
  if (preference === 'eggetarian') {
    return [
      'EGGETARIAN BANNED FOODS (never write any of these):',
      'chicken, fish, mutton, prawn, meat, seafood — eggs only on allowed weekdays.',
    ].join('\n')
  }
  return null
}

export function dietUsesAnimalCookingFat(text: string): boolean {
  return findTerms(text, ANIMAL_COOKING_FAT).length > 0
}
