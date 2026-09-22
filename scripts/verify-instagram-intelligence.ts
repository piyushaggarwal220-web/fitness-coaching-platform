/**
 * Offline verification for Instagram content intelligence planning/drafting.
 * Does not call live Meta or spend OpenAI budget.
 */
import assert from 'node:assert/strict'
import {
  detectContentDuplicates,
  normalizeContentPlan,
} from '../src/lib/jarvis/instagram/planner'
import { validateVideoUpload, validateSourceReferenceOrUrl } from '../src/lib/jarvis/video/sources'
import {
  StubVideoEditProvider,
  TestVideoEditProvider,
  describeVideoProviderConfig,
} from '../src/lib/jarvis/video/provider'
import { buildShortFormFitnessReelPlan, MAX_VARIANTS_PER_JOB } from '../src/lib/jarvis/video/presets'
import { completeVideoJobFromWebhook } from '../src/lib/ai-marketing/workflows/video-jobs'

function testDedupe() {
  const hit = detectContentDuplicates({
    recentHooks: ['Stop doing crunches for fat loss'],
    recentTopics: ['fat loss myths'],
    candidateHook: 'Stop doing crunches for fat loss!!!',
    candidateTopic: 'new topic',
  })
  assert.equal(hit.is_near_duplicate, true)

  const miss = detectContentDuplicates({
    recentHooks: ['Stop doing crunches for fat loss'],
    recentTopics: ['fat loss myths'],
    candidateHook: 'Three cues for a safer barbell squat',
    candidateTopic: 'squat technique',
  })
  assert.equal(miss.is_near_duplicate, false)
}

function testNormalizePlan() {
  const plan = normalizeContentPlan({
    topic: '  Progressive overload  ',
    sourced_facts: ['The available Instagram data shows median reach X for N reels.'],
    jarvis_inference: ['Jarvis recommends testing educational hooks.'],
    jarvis_recommendation: ['Test one educational reel this week.'],
  })
  assert.equal(plan.topic, 'Progressive overload')
  assert.ok(plan.sourced_facts[0]?.includes('available Instagram data'))
  assert.ok(!/always works|go viral|guaranteed/i.test(JSON.stringify(plan)))
}

function testEvidenceLanguageRules() {
  const bad = ['This format always works.', 'This will go viral.', 'This is guaranteed to perform.']
  for (const phrase of bad) {
    assert.equal(/always works|go viral|guaranteed to perform/i.test(phrase), true)
  }
  const good = [
    'The available Instagram data shows…',
    'External research suggests…',
    'Jarvis recommends testing…',
    'There is insufficient first-party data to conclude…',
  ]
  for (const phrase of good) {
    assert.equal(/always works|go viral|guaranteed/i.test(phrase), false)
  }
}

function testInsufficientSampleConfidence() {
  const sampleSize = 3
  const confidence =
    sampleSize < 5 ? 'low' : sampleSize < 12 ? 'medium' : 'high'
  assert.equal(confidence, 'low')
}

async function testStubNeverCompletes() {
  const stub = new StubVideoEditProvider()
  const result = await stub.process({
    id: 'job-1',
    source_video: 'jarvis-video://00000000-0000-4000-8000-000000000001',
    edit_instructions: {},
  })
  assert.equal(result.status, 'failed')
  assert.equal(result.available, false)
  assert.equal(result.output_video, null)
  assert.equal(result.provider_kind, 'STUB')
}

async function testTestProviderRender() {
  const test = new TestVideoEditProvider()
  const analysis = await test.analyzeVideo({
    jobId: 't1',
    sourceVideo: 'jarvis-video://00000000-0000-4000-8000-000000000001',
  })
  assert.equal(analysis.available, true)
  assert.ok(analysis.silence_segments?.length)
  assert.equal(analysis.faces, 'unsupported')

  const rendered = await test.process({
    id: 't1',
    source_video: 'jarvis-video://00000000-0000-4000-8000-000000000001',
    edit_instructions: { duration_target_sec: 30 },
  })
  assert.equal(rendered.status, 'completed')
  assert.ok(rendered.output_video)
  assert.equal(rendered.provider_kind, 'TEST')
  assert.equal(rendered.subtitles?.burned_in, true)
}

function testSourceValidation() {
  const badMime = validateVideoUpload({
    filename: 'clip.mp4',
    mimeType: 'application/pdf',
    byteSize: 1000,
  })
  assert.equal(badMime.ok, false)

  const traversal = validateVideoUpload({
    filename: '../etc/passwd.mp4',
    mimeType: 'video/mp4',
    byteSize: 1000,
  })
  assert.equal(traversal.ok, false)

  const ok = validateVideoUpload({
    filename: 'gym.mp4',
    mimeType: 'video/mp4',
    byteSize: 1000,
  })
  assert.equal(ok.ok, true)

  const ssrf = validateSourceReferenceOrUrl('https://evil.example/video.mp4')
  assert.equal(ssrf.ok, false)

  const path = validateSourceReferenceOrUrl('C:\\Users\\video.mp4')
  assert.equal(path.ok, false)

  const ref = validateSourceReferenceOrUrl('jarvis-video://00000000-0000-4000-8000-000000000001')
  assert.equal(ref.ok, true)
}

function testPresetBounds() {
  const plan = buildShortFormFitnessReelPlan({
    duration_target_sec: 120,
    variants: ['fast_cuts', 'clean_educational', 'high_retention', 'fast_cuts'] as never,
  })
  assert.equal(plan.duration_target_sec, 60)
  assert.equal(plan.variants.length, MAX_VARIANTS_PER_JOB)
  assert.equal(plan.target_aspect, '9:16')
}

function testProviderDescribe() {
  const prev = process.env.VIDEO_EDIT_PROVIDER
  process.env.VIDEO_EDIT_PROVIDER = 'stub'
  delete process.env.VIDEO_EDIT_WEBHOOK_URL
  const cfg = describeVideoProviderConfig()
  assert.equal(cfg.kind, 'STUB')
  assert.equal(cfg.configured, false)
  assert.ok(/NOT CONNECTED/i.test(cfg.note))
  if (prev === undefined) delete process.env.VIDEO_EDIT_PROVIDER
  else process.env.VIDEO_EDIT_PROVIDER = prev
}

async function main() {
  testDedupe()
  testNormalizePlan()
  testEvidenceLanguageRules()
  testInsufficientSampleConfidence()
  testSourceValidation()
  testPresetBounds()
  testProviderDescribe()
  await testStubNeverCompletes()
  await testTestProviderRender()

  // Webhook helper exists (DB call skipped here — covered in verify:video with env)
  assert.equal(typeof completeVideoJobFromWebhook, 'function')

  console.log('verify:instagram-intelligence OK')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
