import assert from 'node:assert/strict'
import {
  matchScore,
  normalizeExerciseQuery,
  shouldSkipExerciseForm,
} from '../src/lib/exercise-form/normalize'

assert.equal(normalizeExerciseQuery('Barbell Bench Press: 3 sets x 8'), 'barbell bench press')
assert.equal(normalizeExerciseQuery('Goblet Squat (heels elevated)'), 'goblet squat')
assert.equal(shouldSkipExerciseForm('Rest'), true)
assert.equal(shouldSkipExerciseForm('Barbell Bench Press'), false)
assert.ok(matchScore('goblet squat', 'Goblet Squat') >= 80)
assert.ok(matchScore('romanian deadlift', 'Barbell Curl') < 36)

console.log('Exercise form lookup checks passed.')

if (process.argv.includes('--live')) {
  void (async () => {
    const { lookupExerciseForm } = await import('../src/lib/exercise-form/lookup')
    const result = await lookupExerciseForm('Goblet Squat')
    console.log(
      JSON.stringify({
        configured: result.configured,
        found: result.found,
        name: result.name,
        steps: result.steps.length,
        muscles: result.muscles,
        videos: result.videos.length,
        exerciseId: result.exerciseId,
        samplePath: result.videos[0]?.url ? new URL(result.videos[0].url).pathname : null,
      })
    )
    if (!result.configured) {
      throw new Error('MUSCLEWIKI_API_KEY is not loaded')
    }
    if (!result.found) {
      throw new Error('MuscleWiki search returned no usable form for Goblet Squat')
    }
  })().catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : err)
    process.exit(1)
  })
}
