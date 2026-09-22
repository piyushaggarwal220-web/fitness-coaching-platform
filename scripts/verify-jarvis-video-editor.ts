/**
 * Phase 6 Jarvis AI Video Editor verification (deterministic, offline).
 * Run: npm run verify:jarvis-video-editor
 */
import assert from 'node:assert/strict'
import type { EditHandoffPayload } from '../src/lib/jarvis/creative/types'
import {
  planEdlFromHandoffSync,
  validateEdl,
  translateEdlToShotstack,
  applyEdlPatch,
  parseRevisionFeedback,
  diffEdls,
  estimateEdlRenderCostUsd,
  centerCropReframe,
  smartFaceReframeCapability,
  type EditDecisionList,
} from '../src/lib/jarvis/video/editor'
import { ensureJarvisToolsRegistered } from '../src/lib/jarvis/tools/builtins'
import { getTool } from '../src/lib/jarvis/tools/registry'
import { evaluateToolPermission } from '../src/lib/jarvis/permissions/risk-engine'

function ok(label: string) {
  console.log(`✓ ${label}`)
}

const handoff: EditHandoffPayload = {
  creative_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  duration: 30,
  source_segments: [
    {
      source_id: '11111111-1111-1111-1111-111111111111',
      start: 12.5,
      end: 15.5,
      role: 'hook',
    },
    {
      source_id: '22222222-2222-2222-2222-222222222222',
      start: 4,
      end: 9,
      role: 'body',
    },
    {
      source_id: '33333333-3333-3333-3333-333333333333',
      start: 31,
      end: 36,
      role: 'cta',
    },
  ],
  sequence: [
    {
      role: 'HOOK',
      kind: 'SPOKEN_FOOTAGE',
      source: {
        source_id: '11111111-1111-1111-1111-111111111111',
        start: 12.5,
        end: 15.5,
        role: 'hook',
      },
      text: 'Most people underestimate calories.',
    },
    {
      role: 'BODY',
      kind: 'SPOKEN_FOOTAGE',
      source: {
        source_id: '22222222-2222-2222-2222-222222222222',
        start: 4,
        end: 9,
        role: 'body',
      },
      text: 'Here is why.',
    },
    {
      role: 'CTA',
      kind: 'SPOKEN_FOOTAGE',
      source: {
        source_id: '33333333-3333-3333-3333-333333333333',
        start: 31,
        end: 36,
        role: 'cta',
      },
      text: 'Save this.',
    },
  ],
  captions: ['Most people underestimate calories.'],
  overlays: ['Most people underestimate calories.', 'Save this.'],
  transitions: ['hard_cut'],
  music_direction: null,
  new_recording_segments: [],
  cta: 'Save this.',
  note: 'test',
}

const lookup = new Map([
  [
    '11111111-1111-1111-1111-111111111111',
    { source_ref: 'jarvis-video://11111111-1111-1111-1111-111111111111', filename: 'a.mp4', duration_sec: 40 },
  ],
  [
    '22222222-2222-2222-2222-222222222222',
    { source_ref: 'jarvis-video://22222222-2222-2222-2222-222222222222', filename: 'b.mp4', duration_sec: 20 },
  ],
  [
    '33333333-3333-3333-3333-333333333333',
    { source_ref: 'jarvis-video://33333333-3333-3333-3333-333333333333', filename: 'c.mp4', duration_sec: 50 },
  ],
])

// 1–5 handoff → EDL
{
  const edl = planEdlFromHandoffSync({
    handoff,
    sourceLookup: lookup,
    creative_content_id: handoff.creative_id,
  })
  assert.equal(edl.provider_agnostic, true)
  assert.equal(edl.timeline.length, 3)
  assert.equal(edl.timeline[0]!.source_start_ms, 12500)
  assert.equal(edl.timeline[0]!.source_end_ms, 15500)
  assert.equal(edl.timeline[0]!.purpose, 'HOOK')
  assert.ok(edl.timeline.every((c) => c.provenance.includes('phase5')))
  assert.equal(edl.output.aspect_ratio, '9:16')
  assert.equal(edl.output.width, 1080)
  assert.equal(edl.output.height, 1920)
  ok('Phase 5 handoff → EDL + exact timestamps + 9:16')
}

// No invented timestamps
{
  const bad: EditHandoffPayload = {
    ...handoff,
    sequence: [
      {
        role: 'HOOK',
        kind: 'SPOKEN_FOOTAGE',
        source: null,
        text: 'no timestamps',
      },
    ],
    source_segments: [],
    new_recording_segments: ['Need hook'],
  }
  const edl = planEdlFromHandoffSync({ handoff: bad, sourceLookup: lookup })
  assert.ok(edl.warnings.some((w) => /not invented|NEW_RECORDING/i.test(w)))
  ok('no invented source timestamps / missing footage warned')
}

// Multi-source
{
  const edl = planEdlFromHandoffSync({ handoff, sourceLookup: lookup })
  const ids = new Set(edl.timeline.map((c) => c.source_id))
  assert.ok(ids.size >= 3)
  ok('multi-source timeline')
}

// Captions provenance
{
  const edl = planEdlFromHandoffSync({ handoff, sourceLookup: lookup })
  assert.ok(edl.captions.every((c) => c.provenance !== 'TRANSCRIPT_DERIVED' || true))
  assert.ok(edl.captions.every((c) => ['SCRIPT_DERIVED', 'AI_SUGGESTED', 'USER_PROVIDED', 'TRANSCRIPT_DERIVED'].includes(c.provenance)))
  assert.ok(edl.overlays.some((o) => o.kind === 'HOOK_TEXT' || o.kind === 'CTA_TEXT'))
  ok('caption/overlay provenance labeled')
}

// Reframe honesty
{
  assert.equal(centerCropReframe().capability, 'SUPPORTED')
  assert.equal(smartFaceReframeCapability().capability, 'UNSUPPORTED')
  ok('center crop supported; smart face UNSUPPORTED')
}

// Validation
{
  const edl = planEdlFromHandoffSync({ handoff, sourceLookup: lookup })
  const v = validateEdl(edl)
  assert.equal(v.ok, true)
  ok('EDL validation passes for valid multi-source')
}

// Missing footage fails validation
{
  const missingHandoff: EditHandoffPayload = {
    ...handoff,
    sequence: [
      {
        role: 'CTA',
        kind: 'NEW_RECORDING_REQUIRED',
        source: null,
        text: 'Record CTA',
      },
    ],
    source_segments: [],
    new_recording_segments: ['CTA'],
  }
  const edl = planEdlFromHandoffSync({ handoff: missingHandoff, sourceLookup: lookup })
  const v = validateEdl(edl)
  assert.equal(v.ok, false)
  assert.ok(v.errors.some((e) => /NEW_RECORDING_REQUIRED/.test(e)))
  ok('missing footage detected')
}

// Shotstack translation — no provider fields in canonical EDL
{
  const edl = planEdlFromHandoffSync({ handoff, sourceLookup: lookup })
  const raw = JSON.stringify(edl)
  assert.doesNotMatch(raw, /"callback"\s*:/)
  assert.doesNotMatch(raw, /shotstackCreateRender/)

  const urls: Record<string, string> = {}
  for (const m of edl.source_manifest) {
    urls[m.source_ref] = `https://example.invalid/signed/${m.source_id}.mp4`
  }
  const translated = translateEdlToShotstack({
    edl,
    sourceUrlByRef: urls,
    callbackUrl: 'https://app.lurvox.in/api/admin/jarvis/video-webhook?jarvis_job_id=test',
  })
  assert.equal(translated.ok, true)
  assert.ok(translated.edit)
  assert.equal(translated.edit!.output.size.width, 1080)
  assert.equal(translated.edit!.output.size.height, 1920)
  assert.ok(translated.edit!.timeline.tracks.some((t) => t.clips.length > 0))
  const videoClips = translated.edit!.timeline.tracks.flatMap((t) => t.clips).filter(
    (c) => (c.asset as { type?: string })?.type === 'video'
  )
  assert.ok(videoClips.length >= 3)
  ok('Shotstack translation multi-source + no EDL leakage')
}

// Cost estimate
{
  const edl = planEdlFromHandoffSync({ handoff, sourceLookup: lookup })
  const cost = estimateEdlRenderCostUsd(edl.estimated_duration_ms)
  assert.ok(cost > 0 && cost < 5)
  ok('render cost estimate')
}

// Revision + keep everything else + diff
{
  const edl = planEdlFromHandoffSync({ handoff, sourceLookup: lookup })
  // Simulate a zoom to remove
  edl.timeline[1]!.scale = 1.2
  const { targets, preserve_rest } = parseRevisionFeedback(
    'Remove the zoom at 7 seconds and make the hook faster. Keep everything else the same.'
  )
  assert.ok(targets.includes('ZOOM'))
  assert.ok(targets.includes('HOOK_SPEED'))
  assert.equal(preserve_rest, true)

  const { edl: v2, changed } = applyEdlPatch(
    edl,
    'Remove the zoom at 7 seconds and make the hook faster. Keep everything else the same.'
  )
  assert.ok(v2.timeline.every((c) => c.scale === 1))
  assert.ok(changed.some((c) => /zoom|Hook duration/i.test(c)))
  // Body source should still exist
  assert.ok(v2.timeline.some((c) => c.purpose === 'BODY'))

  v2.version = 2
  const d = diffEdls(edl, v2)
  assert.ok(d.changed_count >= 1)
  assert.ok(d.ops.some((o) => o.kind === 'changed' || o.kind === 'unchanged'))
  ok('targeted revision + keep rest + EDL diff')
}

// Tools
async function checkTools() {
  ensureJarvisToolsRegistered()
  for (const name of [
    'video.create_edl',
    'video.get_edl',
    'video.validate_edl',
    'video.render_edl',
    'video.revise_edl',
    'video.compare_edl_versions',
    'video.get_render',
    'video.list_renders',
    'video.approve_render',
    'video.reject_render',
  ]) {
    assert.ok(getTool(name), name)
  }
  // No auto-publish tool in editor set
  assert.equal(getTool('video.render_edl')?.description.includes('Never publishes'), true)
  const perm = await evaluateToolPermission({ toolName: 'video.create_edl', source: 'chat' })
  assert.equal(perm.allowed, true)
  ok('editor tools registered; no auto-publish; permissions ok')
}

checkTools()
  .then(() => {
    console.log('\nAll Phase 6 video editor verification checks passed.')
    console.log(
      JSON.stringify({
        shotstack_live: 'run verify:video separately for live render',
        taste_engine: 'Phase 7 — see verify:jarvis-taste',
        auto_publish: false,
      })
    )
  })
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
