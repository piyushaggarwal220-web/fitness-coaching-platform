import assert from 'node:assert/strict'
import {
  applyExerciseAliases,
  matchScore,
  normalizeExerciseQuery,
  shouldSkipExerciseForm,
} from '../src/lib/exercise-form/normalize'

assert.equal(normalizeExerciseQuery('Barbell Bench Press: 3 sets x 8'), 'barbell bench press')
assert.equal(normalizeExerciseQuery('Goblet Squat (heels elevated)'), 'goblet squat')
assert.equal(applyExerciseAliases(normalizeExerciseQuery('RDL')), 'romanian deadlift')
assert.equal(applyExerciseAliases(normalizeExerciseQuery('Skull crushers')), 'lying tricep extension')
assert.equal(applyExerciseAliases(normalizeExerciseQuery('BB Bench Press')), 'barbell bench press')
assert.equal(shouldSkipExerciseForm('Rest'), true)
assert.equal(shouldSkipExerciseForm('Barbell Bench Press'), false)
assert.ok(matchScore('goblet squat', 'Goblet Squat') >= 80)
assert.ok(matchScore('romanian deadlift', 'Barbell Curl') < 36)

console.log('Exercise form lookup checks passed.')

if (process.argv.includes('--live')) {
  void (async () => {
    const { lookupExerciseForm } = await import('../src/lib/exercise-form/lookup')
    const { fetchMuscleWikiMedia, pickFormVideo } = await import('../src/lib/exercise-form/musclewiki')
    const result = await lookupExerciseForm('Goblet Squat')
    const video = pickFormVideo(result.videos)
    console.log(
      JSON.stringify({
        configured: result.configured,
        found: result.found,
        name: result.name,
        steps: result.steps.length,
        muscles: result.muscles,
        videos: result.videos.length,
        exerciseId: result.exerciseId,
        samplePath: video ? new URL(video.url).pathname : null,
      })
    )
    if (!result.configured) {
      throw new Error('MUSCLEWIKI_API_KEY is not loaded')
    }
    if (!result.found || !video) {
      throw new Error('MuscleWiki search returned no usable form for Goblet Squat')
    }
    const media = await fetchMuscleWikiMedia(video.url, 'bytes=0-2047')
    const type = media.headers.get('content-type') ?? ''
    await media.body?.cancel()
    console.log(
      JSON.stringify({
        mediaStatus: media.status,
        contentType: type,
      })
    )
    if (media.status !== 200 && media.status !== 206) {
      throw new Error(`Form video request failed (${media.status})`)
    }
    if (!/video|mp4|octet-stream/i.test(type)) {
      throw new Error(`Unexpected form video content-type: ${type || 'empty'}`)
    }
    console.log('MuscleWiki form video returned.')
  })().catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : err)
    process.exit(1)
  })
}
