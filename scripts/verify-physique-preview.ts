/**
 * Physique preview rules: one image a day, plan prompts, and photo checks.
 */
import {
  PHYSIQUE_PREVIEWS_PER_DAY,
  isPhysiquePreviewPlan,
  isVisitorId,
  parseSafetyDecision,
  physiquePreviewPrompt,
  sniffPreviewMediaType,
} from '../src/lib/physique-preview'

let failed = 0

function assert(label: string, condition: boolean) {
  if (!condition) {
    console.error(`FAIL ${label}`)
    failed++
  } else {
    console.log(`PASS ${label}`)
  }
}

assert('one preview per day', PHYSIQUE_PREVIEWS_PER_DAY === 1)
assert('known plans only', isPhysiquePreviewPlan('6_months') && !isPhysiquePreviewPlan('1_week'))
assert(
  'visitor id must be a uuid v4',
  isVisitorId('550e8400-e29b-41d4-a716-446655440000') && !isVisitorId('not-an-id')
)
assert('safety allows only the word allow', parseSafetyDecision('allow') === 'allow')
assert('unsure safety text is a refusal', parseSafetyDecision('unsure') === 'refuse')
assert('blank safety text is a refusal', parseSafetyDecision('  ') === 'refuse')

const fatLoss = physiquePreviewPrompt('3_months')
const athletic = physiquePreviewPrompt('12_months')
assert('fat loss prompt is a modest change', /3-month fat-loss/.test(fatLoss) && /gym clothes/.test(fatLoss))
assert('athletic prompt stays realistic', /12-month athletic/.test(athletic) && /not a competition bodybuilder/.test(athletic))
assert('prompts forbid shirtless output', /Do not make them shirtless/.test(fatLoss))

assert(
  'jpeg magic bytes are accepted',
  sniffPreviewMediaType(new Uint8Array([0xff, 0xd8, 0xff, 0x00])) === 'image/jpeg'
)
assert('random bytes are rejected', sniffPreviewMediaType(new Uint8Array([1, 2, 3, 4])) === null)

if (failed > 0) {
  console.error(`${failed} failed`)
  process.exit(1)
}
console.log('physique preview checks passed')
