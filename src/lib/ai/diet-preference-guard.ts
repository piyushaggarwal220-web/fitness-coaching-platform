/**
 * Scan diet prose for foods forbidden by diet preference.
 * Used after generation to reject/retry plans that ignore veg/vegan constraints.
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

const EGG_TERMS = ['egg', 'eggs', 'omelette', 'omelet', 'bhurji egg', 'egg bhurji', 'boiled egg']

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
      if (!m || typeof m !== 'object') return ''
      const row = m as { meal?: unknown; example?: unknown; foods?: unknown }
      return [row.meal, row.example, row.foods].filter((x) => typeof x === 'string').join('\n')
    })
    .join('\n')
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
    // whey is animal-derived; vegetarians who use whey are rare in our onboarding —
    // Hard Constraints already ban whey for strict veg unless they opted in separately.
    // Keep whey allowed only when not vegan; vegetarian may use dairy whey if they said yes.
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

export function enforceDietPreference(
  plan: { meals?: unknown; calories?: number },
  preference: DietPreferenceKind,
  opts?: { extraProse?: string | null }
): DietPreferenceSafetyResult {
  if (!preference || preference === 'non_vegetarian') {
    return { ok: true }
  }

  const prose = [mealProseFromPlan(plan), opts?.extraProse ?? ''].filter(Boolean).join('\n')
  if (!prose.trim()) return { ok: true }

  const violations = findDietPreferenceViolations(prose, preference)
  if (violations.length === 0) return { ok: true }

  const terms = [...new Set(violations.map((v) => v.term))]
  const categories = [...new Set(violations.map((v) => v.category))]

  const veganHint =
    preference === 'vegan'
      ? [
          'VEGAN REWRITE REQUIRED: Remove ALL animal products.',
          'Banned: ghee, butter, milk, curd/dahi, yogurt, paneer, cheese, cream, whey, honey, eggs, meat, fish.',
          'Cooking fat: use oil only (mustard oil, groundnut oil, coconut oil, olive oil) — never ghee or butter.',
          'Protein: dal, soya chunks, tofu, chana, rajma, peanuts, peanut butter, sprouts — never dairy.',
          'Replace every dairy item with a plant option and keep calories at or above the floor.',
        ].join(' ')
      : preference === 'vegetarian'
        ? [
            'VEGETARIAN REWRITE REQUIRED: Remove eggs, chicken, fish, mutton, prawn, and all meat/seafood.',
            'Use dal, paneer, soya, chana, curd, nuts. Never write egg or fish in any meal or swap.',
          ].join(' ')
        : [
            'EGGETARIAN REWRITE REQUIRED: Remove chicken, fish, mutton, prawn, and all meat/seafood.',
            'Eggs only on allowed weekdays from Hard Constraints.',
          ].join(' ')

  return {
    ok: false,
    error: `Diet preference (${preference}) violated by: ${terms.join(', ')} (${categories.join(', ')}).`,
    hint: veganHint,
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
