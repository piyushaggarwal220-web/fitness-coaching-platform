import assert from 'node:assert/strict'
import { DEFAULTS, MODELS, resolvePlanGenerationModel } from '../src/lib/ai/config'
import { getRecommendedModelForTier } from '../src/lib/ai/complexity-score'

assert.equal(MODELS.GPT_TERRA, 'gpt-5.6-terra')
assert.equal(MODELS.GPT_LUNA, 'gpt-5.6-luna')
assert.equal('GPT_ASTRA' in MODELS, false)
assert.notEqual(DEFAULTS.DEFAULT_MODEL, 'gpt-5.6')
assert.notEqual(MODELS.GPT_TERRA, 'gpt-5.6')
assert.notEqual(MODELS.GPT_LUNA, 'gpt-5.6')

assert.equal(
  resolvePlanGenerationModel({ actionId: 'initial_diet', recommendedModel: 'gpt-6-astra' }),
  MODELS.GPT_TERRA
)
assert.equal(
  resolvePlanGenerationModel({ actionId: 'initial_workout', recommendedModel: MODELS.GPT_LUNA }),
  MODELS.GPT_TERRA
)
assert.equal(
  resolvePlanGenerationModel({ actionId: 'initial_cardio', recommendedModel: MODELS.GPT_LUNA }),
  MODELS.GPT_TERRA
)
assert.equal(
  resolvePlanGenerationModel({ actionId: 'initial_supplements', recommendedModel: MODELS.GPT_LUNA }),
  MODELS.GPT_TERRA
)
assert.equal(
  resolvePlanGenerationModel({ recommendedModel: MODELS.GPT_LUNA }),
  MODELS.GPT_TERRA
)
assert.equal(
  resolvePlanGenerationModel({
    actionId: 'review_update_diet',
    recommendedModel: MODELS.GPT_LUNA,
  }),
  MODELS.GPT_LUNA
)
assert.equal(
  resolvePlanGenerationModel({
    actionId: 'review_update_workout',
    recommendedModel: 'gpt-6-astra',
  }),
  MODELS.GPT_LUNA
)
assert.equal(
  resolvePlanGenerationModel({
    actionId: 'review_update_cardio',
    recommendedModel: 'gpt-6-astra',
  }),
  MODELS.GPT_LUNA
)
assert.equal(
  resolvePlanGenerationModel({
    actionId: 'review_update_diet',
    recommendedModel: 'gpt-6-astra',
    medicalNotes: 'Type 2 diabetes, insulin',
  }),
  MODELS.GPT_LUNA
)
assert.equal(getRecommendedModelForTier('LOW'), MODELS.GPT_LUNA)
assert.equal(getRecommendedModelForTier('MEDIUM'), MODELS.GPT_LUNA)
assert.equal(getRecommendedModelForTier('HIGH'), MODELS.GPT_LUNA)

console.log('✓ OpenAI Terra/Luna routing; Astra is not used')
