/**
 * Offline check: production diet/workout prompts must ban cross-day shorthand
 * so the daily tracker can parse every day independently.
 * Run: npx tsx scripts/verify-full-day-plan-prompts.ts
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

let failed = 0

function assert(label: string, condition: boolean) {
  if (!condition) {
    console.error(`FAIL ${label}`)
    failed++
  } else {
    console.log(`PASS ${label}`)
  }
}

function read(relPath: string): string {
  return readFileSync(join(process.cwd(), relPath), 'utf8')
}

const bannedLegacy = [
  'some days can simply say "repeat Monday\'s breakfast"',
  'same as Tuesday but swap rice for 2 rotis',
]

const requiredPhrases = ['NEVER write', 'cross-day', 'daily tracker cannot resolve']

const dietFiles = [
  'prompts/production/initial-diet.prompt',
  'prompts/production/updated-diet.prompt',
]
const workoutFiles = [
  'prompts/production/initial-workout.prompt',
  'prompts/production/updated-workout.prompt',
  'prompts/production/initial-workout-home.prompt',
  'prompts/production/updated-workout-home.prompt',
]

for (const phrase of bannedLegacy) {
  for (const file of dietFiles) {
    assert(`${file} removes legacy shorthand`, !read(file).includes(phrase))
  }
}

for (const file of [...dietFiles, ...workoutFiles, 'prompts/production/system-prompt.prompt']) {
  const body = read(file)
  for (const phrase of requiredPhrases) {
    // system prompt uses "never use" rather than "NEVER write"
    if (file.includes('system-prompt') && phrase === 'NEVER write') {
      assert(`${file} includes never use cross-day rule`, /never use cross-day/i.test(body))
      continue
    }
    assert(`${file} includes "${phrase}"`, body.toLowerCase().includes(phrase.toLowerCase()))
  }
}

const generatePlanSrc = read('src/lib/ai/generate-plan.ts')
assert(
  'generate-plan diet output instructions ban cross-day refs',
  generatePlanSrc.includes('LIBRARY_DIET_OUTPUT_INSTRUCTIONS') &&
    generatePlanSrc.includes('use Monday\\\'s plan') &&
    generatePlanSrc.includes('daily tracker cannot resolve day-to-day pointers')
)
assert(
  'generate-plan workout output instructions ban cross-day refs',
  generatePlanSrc.includes('LIBRARY_WORKOUT_OUTPUT_INSTRUCTIONS') &&
    /follow Thursday\\'s workout/.test(generatePlanSrc) &&
    generatePlanSrc.includes('rewrite the complete exercise list under both headers')
)

const editSrc = read('src/lib/ai/edit-plan-section.ts')
assert(
  'edit-plan-section bans introducing cross-day references',
  editSrc.includes('Never introduce cross-day references') &&
    editSrc.includes('copy the full content under both day headers')
)
assert(
  'edit-plan-section uses full plan token ceiling',
  editSrc.includes('LIMITS.MAX_SECTION_EDIT_TOKENS') &&
    editSrc.includes('MODELS.CLAUDE_SONNET') &&
    editSrc.includes("stopReason === 'max_tokens'")
)

const aiConfig = read('src/lib/ai/config.ts')
assert(
  'MAX_PLAN_TOKENS uses the full model output ceiling for complete weeks',
  /MAX_PLAN_TOKENS:\s*64000/.test(aiConfig)
)
assert(
  'MAX_SECTION_EDIT_TOKENS matches full-week ceiling',
  /MAX_SECTION_EDIT_TOKENS:\s*64000/.test(aiConfig)
)

const manifest = read('prompts/production/manifest.json')
assert('manifest includes system_prompt for republish', manifest.includes('"system_prompt"'))

assert(
  'diet prompts use Day N (Weekday) headers',
  dietFiles.every((file) => read(file).includes('Day 1 (Monday)'))
)
assert(
  'diet prompts count only the primary meal option',
  dietFiles.every((file) => /primary option/i.test(read(file)))
)
assert(
  'workout prompts keep training-days cap and leftover rest days',
  workoutFiles.every((file) => /training days per week is a hard cap/i.test(read(file)) || /exact count/i.test(read(file)))
)

if (failed > 0) {
  console.error(`\n${failed} full-day plan prompt checks failed`)
  process.exit(1)
}

console.log('\nAll full-day plan prompt checks passed')
