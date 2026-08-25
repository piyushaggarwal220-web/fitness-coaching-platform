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
assert.equal(
  shouldSkipExerciseForm(
    'Focus on the squat and RDL today — these are your strength anchors. Keep the tempo controlled on the way down (2-'
  ),
  true
)
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

    if (process.argv.includes('--prod')) {
      const { createClient } = await import('@supabase/supabase-js')
      const { createAdminClient } = await import('../src/lib/supabase/admin')
      const { DEMO_CLIENT_EMAIL } = await import('../src/lib/admin/testing-accounts')
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
      const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim()
      if (!supabaseUrl || !anonKey) {
        throw new Error('Missing Supabase URL or anon key')
      }
      const admin = createAdminClient()
      const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
        type: 'magiclink',
        email: DEMO_CLIENT_EMAIL,
      })
      if (linkError) throw linkError
      const otp = linkData.properties?.email_otp
      if (!otp) throw new Error('generateLink did not return an email OTP')
      const browser = createClient(supabaseUrl, anonKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      })
      const { data: verified, error: verifyError } = await browser.auth.verifyOtp({
        email: DEMO_CLIENT_EMAIL,
        token: otp,
        type: 'email',
      })
      if (verifyError || !verified.session) {
        throw verifyError ?? new Error('Could not create a client session')
      }
      const session = verified.session
      const cookieName = `sb-${new URL(supabaseUrl).hostname.split('.')[0]}-auth-token`
      const cookieValue = encodeURIComponent(JSON.stringify(session))
      const formRes = await fetch('https://app.lurvox.in/api/exercises/form?name=Goblet%20Squat', {
        headers: { Cookie: `${cookieName}=${cookieValue}` },
      })
      const formJson = (await formRes.json()) as {
        found?: boolean
        hasVideo?: boolean
        name?: string
        error?: string
      }
      console.log(
        JSON.stringify({
          prodFormStatus: formRes.status,
          found: formJson.found,
          hasVideo: formJson.hasVideo,
          name: formJson.name,
        })
      )
      if (!formRes.ok || !formJson.hasVideo) {
        throw new Error(formJson.error ?? 'Production form lookup did not return a video')
      }
      const mediaRes = await fetch('https://app.lurvox.in/api/exercises/form/media?name=Goblet%20Squat', {
        headers: {
          Cookie: `${cookieName}=${cookieValue}`,
          Range: 'bytes=0-2047',
        },
      })
      const prodType = mediaRes.headers.get('content-type') ?? ''
      await mediaRes.body?.cancel()
      console.log(
        JSON.stringify({
          prodMediaStatus: mediaRes.status,
          prodContentType: prodType,
        })
      )
      if (mediaRes.status !== 200 && mediaRes.status !== 206) {
        throw new Error(`Production form video failed (${mediaRes.status})`)
      }
      if (!/video|mp4|octet-stream/i.test(prodType)) {
        throw new Error(`Unexpected production video content-type: ${prodType || 'empty'}`)
      }
      console.log('Production form video returned.')
    }
  })().catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : err)
    process.exit(1)
  })
}
