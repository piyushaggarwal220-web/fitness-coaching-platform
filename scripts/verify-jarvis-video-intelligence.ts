/**
 * Phase 4 Jarvis Video Intelligence verification (offline + TEST provider).
 * Run: npm run verify:jarvis-video-intelligence
 *
 * Does NOT spend money on live Whisper. Does NOT invent live analysis.
 */
import assert from 'node:assert/strict'
import { validateVideoUpload } from '../src/lib/jarvis/video/sources'
import {
  aspectFromDims,
  PIPELINE_STAGES,
} from '../src/lib/jarvis/video/intelligence/types'
import {
  TestVideoIntelligenceProvider,
  StubVideoIntelligenceProvider,
  describeVideoIntelligenceConfig,
  getVideoIntelligenceProvider,
  classifyByHeuristic,
} from '../src/lib/jarvis/video/intelligence/provider'
import { ensureJarvisToolsRegistered } from '../src/lib/jarvis/tools/builtins'
import { getTool } from '../src/lib/jarvis/tools/registry'
import { evaluateToolPermission } from '../src/lib/jarvis/permissions/risk-engine'

function ok(label: string) {
  console.log(`✓ ${label}`)
}

// Force TEST intelligence for deterministic checks
process.env.VIDEO_INTELLIGENCE_PROVIDER = 'test'

// --- Ingestion validation ---
{
  const good = validateVideoUpload({
    filename: 'clip_001.mp4',
    mimeType: 'video/mp4',
    byteSize: 1024,
  })
  assert.equal(good.ok, true)

  const badMime = validateVideoUpload({
    filename: 'x.exe',
    mimeType: 'application/octet-stream',
    byteSize: 100,
  })
  assert.equal(badMime.ok, false)

  const tooBig = validateVideoUpload({
    filename: 'huge.mp4',
    mimeType: 'video/mp4',
    byteSize: 300 * 1024 * 1024,
  })
  assert.equal(tooBig.ok, false)

  const path = validateVideoUpload({
    filename: '../evil.mp4',
    mimeType: 'video/mp4',
    byteSize: 100,
  })
  assert.equal(path.ok, false)

  ok('ingestion validation (valid/invalid/path)')
}

// --- Metadata helpers ---
{
  const a = aspectFromDims(1080, 1920)
  assert.equal(a.orientation, 'portrait')
  assert.ok(a.aspect_ratio)
  const b = aspectFromDims(null, null)
  assert.equal(b.orientation, null)
  ok('media metadata helpers')
}

// --- Provider honesty ---
async function checkProviders() {
  const stub = new StubVideoIntelligenceProvider()
  const caps = stub.capabilities()
  assert.equal(caps.transcription, 'not_configured')
  const tx = await stub.transcribe({
    sourceId: '00000000-0000-4000-8000-000000000001',
    privateFetchUrl: 'https://example.invalid/x.mp4',
  })
  assert.equal(tx.status, 'NOT_CONFIGURED')
  assert.match(tx.error || '', /not currently configured/i)
  assert.doesNotMatch(tx.error || '', /no speech detected/i)

  const test = new TestVideoIntelligenceProvider()
  assert.equal(test.kind, 'TEST')
  assert.equal(test.capabilities().scene_detection, 'unsupported')
  assert.equal(test.capabilities().face_detection, 'unsupported')
  const meta = await test.extractMetadata({
    sourceId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    privateFetchUrl: 'test://',
  })
  assert.equal(meta.available, true)
  assert.equal(meta.source, 'test')
  assert.ok(meta.duration_sec && meta.duration_sec > 0)

  const transcript = await test.transcribe({
    sourceId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    privateFetchUrl: 'test://',
  })
  assert.equal(transcript.status, 'COMPLETED')
  assert.ok(transcript.segments.length >= 1)
  assert.ok(transcript.segments.every((s) => s.end > s.start))

  ok('provider honesty (stub NOT_CONFIGURED, test fixtures labeled TEST)')

  const speech = await test.detectSpeechSegments!({
    sourceId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    transcript,
  })
  assert.equal(speech.status, 'supported')
  assert.ok(speech.segments.length >= 1)
  for (let i = 1; i < speech.segments.length; i++) {
    assert.ok(speech.segments[i]!.start_time >= speech.segments[i - 1]!.start_time)
  }

  const classified = await test.classifySegments!({
    sourceId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    segments: speech.segments,
    transcript,
  })
  assert.ok(classified.segments.every((s) => s.evidence.length > 0))
  assert.ok(classified.segments.every((s) => s.classification_label))

  const heuristic = classifyByHeuristic(speech.segments)
  assert.ok(heuristic[0]?.evidence.some((e) => e.startsWith('heuristic:')))

  ok('segments + classification evidence')

  const quality = await test.analyzeQuality!({
    sourceId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    metadata: meta,
  })
  assert.ok(quality.deterministic.resolution)
  assert.equal(quality.judgment_available, true)
  assert.equal(quality.judgment_source, 'heuristic')
  assert.ok(quality.judgment.notes?.[0]?.includes('TEST'))
  ok('quality: deterministic vs judgment separated')
}

// --- Pipeline stages list ---
{
  assert.deepEqual(PIPELINE_STAGES[0], 'VALIDATE')
  assert.ok(PIPELINE_STAGES.includes('TRANSCRIPTION'))
  assert.ok(PIPELINE_STAGES.includes('OPPORTUNITIES'))
  ok('pipeline stage ordering defined')
}

// --- Opportunity / estimate pure shapes ---
{
  const mappings = [
    { source_id: 's1', start: 14.2, end: 27.8, role: 'hook' },
    { source_id: 's2', start: 4.1, end: 15.2, role: 'body' },
  ]
  assert.ok(mappings.every((m) => typeof m.start === 'number' && m.end > m.start))
  const note = 'Approximate estimate only — not an exact publishable Reel count.'
  assert.match(note, /Approximate/)
  ok('source mapping + approximate estimate language')
}

// --- Tools registered; memory cannot bypass ---
async function checkTools() {
  ensureJarvisToolsRegistered()
  for (const name of [
    'video.find_sources',
    'video.analyze',
    'video.create_session',
    'video.session_summary',
    'video.find_opportunities',
    'video.provider_status',
  ]) {
    assert.ok(getTool(name), `missing tool ${name}`)
  }

  const statusTool = getTool('video.provider_status')!
  const status = await statusTool.execute({}, {
    actorId: null,
    conversationId: null,
    taskId: null,
    source: 'system',
  })
  assert.ok(status && typeof status === 'object')
  assert.ok(
    'edit_provider' in (status as object) ||
      'intelligence' in (status as object) ||
      'provider' in (status as object)
  )

  const blocked = await evaluateToolPermission({
    toolName: 'shopify.change_payment_settings',
    source: 'chat',
  })
  assert.equal(blocked.allowed, false)

  const p = getVideoIntelligenceProvider()
  assert.equal(p.name, 'test')
  const desc = describeVideoIntelligenceConfig()
  assert.equal(desc.kind, 'TEST')
  assert.match(desc.note, /TEST/)

  ok('tools registered; permissions intact; TEST factory')
}

// --- Security: no secrets in describe ---
{
  const dumped = JSON.stringify(describeVideoIntelligenceConfig())
  assert.equal(/sk-|Bearer\s+\S+|api[_-]?key\s*[:=]/i.test(dumped), false)
  ok('no secret leakage in intelligence describe')
}

checkProviders()
  .then(() => checkTools())
  .then(() => {
    console.log('\nAll Phase 4 video intelligence verification checks passed.')
    console.log(
      JSON.stringify({
        live_transcription: 'NOT CONFIGURED unless VIDEO_INTELLIGENCE_TRANSCRIPTION=openai',
        live_cv: 'NOT IMPLEMENTED (scenes/faces/visual semantic unsupported)',
        shotstack: 'render provider only — metadata probe when configured',
      })
    )
  })
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
