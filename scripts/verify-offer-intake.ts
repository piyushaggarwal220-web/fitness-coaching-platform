import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import {
  askedReviewSections,
  buildReviewSections,
  buildOnboardingData,
  getOnboardingWizardSteps,
  INITIAL_ONBOARDING_FORM,
  REVIEW_LABEL_STEP,
} from '../src/lib/onboarding'

const root = path.resolve(__dirname, '..')

function walk(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name)
    if (statSync(full).isDirectory()) {
      if (name === 'node_modules' || name === '.next') continue
      walk(full, acc)
    } else if (/\.(ts|tsx|js|mjs|liquid|json)$/.test(name)) {
      acc.push(full)
    }
  }
  return acc
}

const forbidden = [
  /weekly coach phone call included/i,
  /includes a weekly coach phone call/i,
  /weekly phone calls are 12-month/i,
  /do you want a weekly coach phone call/i,
  /weekly coach phone call is 12-month/i,
  /with a weekly coach phone call/i,
  /aria-label="Included">✓<\/span><\/td>\s*<\/tr>\s*<\/tbody>[\s\S]{0,40}phone call/i,
]

const salesRoots = [path.join(root, 'src'), path.join(root, 'scripts', 'shopify-assets')]
const hits: string[] = []
for (const dir of salesRoots) {
  for (const file of walk(dir)) {
    if (file.endsWith(`${path.sep}verify-offer-intake.ts`)) continue
    const text = readFileSync(file, 'utf8')
    for (const pattern of forbidden) {
      if (pattern.test(text)) hits.push(`${path.relative(root, file)} matches ${pattern}`)
    }
  }
}
assert.deepEqual(hits, [], `Plan pages still sell a weekly coach phone call:\n${hits.join('\n')}`)

for (const location of ['gym', 'home', 'both'] as const) {
  const steps = getOnboardingWizardSteps({ training_location: location })
  assert.ok(steps.includes(9), `${location} skips gym equipment`)
  assert.ok(steps.includes(16), `${location} skips monthly food budget`)
  assert.ok(steps.includes(15), `${location} skips allergies`)
  assert.ok(steps.includes(17), `${location} skips the food plate`)
  assert.ok(steps.includes(18), `${location} skips dinner and snacks`)
  assert.ok(!steps.includes(4), `${location} asks the full daily-life screen`)
}

const photos = { front: null, side: null, back: null }
const allLabels = buildReviewSections(INITIAL_ONBOARDING_FORM, photos).flatMap((section) =>
  section.items.map((item) => item.label)
)
const unmapped = allLabels.filter((label) => REVIEW_LABEL_STEP[label] === undefined)
assert.deepEqual(unmapped, [], `Review labels have no intake step: ${unmapped.join(', ')}`)

const shown = askedReviewSections(
  { ...INITIAL_ONBOARDING_FORM, training_location: 'gym' },
  photos
)
  .flatMap((section) => section.items.map((item) => item.label))

assert.ok(shown.includes('Gym stations'), 'Review hides gym stations')
assert.ok(shown.includes('Monthly food budget'), 'Review hides food budget')
assert.ok(shown.includes('Foods you eat'), 'Review hides confirmed foods')
assert.ok(shown.includes('Food allergies'), 'Review hides allergies')
assert.ok(shown.includes('Dinner'), 'Review hides dinner')
assert.ok(shown.includes('Activity level'), 'Review hides activity level')
assert.ok(shown.includes('Main meals'), 'Review hides the served-meal question')
assert.ok(!shown.includes('Occupation'), 'Review shows a question the wizard does not ask')

const served = buildOnboardingData(
  {
    ...INITIAL_ONBOARDING_FORM,
    meal_control: 'fixed',
    breakfast: '4 idli and sambar',
    lunch: 'rice, dal, and a vegetable',
    dinner: '3 chapati and sabzi',
    eat_out_days: '1',
    eat_out_weekdays: ['sunday'],
  },
  22
)
assert.equal(served.eatingPattern?.mealControl, 'fixed')
assert.equal(served.eatingPattern?.whoCooks, 'pg_hostel')
assert.equal(served.eatingPattern?.eatOutWeekdays?.[0], 'sunday')
assert.match(served.messMenu?.text ?? '', /Breakfast served: 4 idli and sambar/)
assert.match(served.messMenu?.text ?? '', /Dinner served: 3 chapati and sabzi/)

console.log('Offer and intake checks passed.')
