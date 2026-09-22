/**
 * Phase 7 Jarvis Taste Engine verification (offline unit checks).
 * Run: npm run verify:jarvis-taste
 */
import assert from 'node:assert/strict'
import {
  parseTasteFeedback,
  isRevisionOnlyInstruction,
  isSensitiveInferenceAttempt,
  signalsFromEdlDiff,
  signalsFromWeakRejection,
  applySignalInMemory,
  applyEvidenceWeight,
  resolveStatus,
  oppositePolarity,
  decayConfidence,
  clampConfidence,
  retrieveTasteSync,
  effectsFromRetrievedTaste,
  applyTasteToEdl,
  explainPreference,
  explainEditChoice,
  preferenceFingerprint,
  CANDIDATE_THRESHOLD,
  ACTIVE_AUTO_THRESHOLD,
  ACTIVE_MIN_EVIDENCE,
  STALE_DAYS,
  type TastePreference,
} from '../src/lib/jarvis/taste'
import type { EditDecisionList, EdlDiff } from '../src/lib/jarvis/video/editor/types'
import { ensureJarvisToolsRegistered } from '../src/lib/jarvis/tools/builtins'
import { getTool } from '../src/lib/jarvis/tools/registry'
import { evaluateToolPermission } from '../src/lib/jarvis/permissions/risk-engine'

function ok(label: string) {
  console.log(`✓ ${label}`)
}

// --- 1. Explicit feedback extraction ---
{
  const zoom = parseTasteFeedback('Too many zooms.')
  assert.ok(zoom.some((s) => s.preference_key === 'zoom_frequency' && s.direction === 'DECREASE'))
  assert.ok(zoom.every((s) => s.evidence_type === 'EXPLICIT_FEEDBACK' || s.evidence_type === 'USER_INSTRUCTION'))

  const captions = parseTasteFeedback('I like these captions.')
  assert.ok(captions.some((s) => s.preference_key === 'caption_style'))
  assert.ok(captions[0].confidence <= 0.25, 'ambiguous caption like stays low confidence')

  const hook = parseTasteFeedback('Make the first 2 seconds faster.')
  assert.ok(hook.some((s) => s.preference_key === 'hook_pace' && s.direction === 'FASTER'))

  ok('explicit feedback extraction')
}

// --- Keep everything else = revision only ---
{
  assert.equal(isRevisionOnlyInstruction('Keep everything else the same.'), true)
  const only = parseTasteFeedback('Keep everything else the same.')
  assert.ok(only.every((s) => s.skip_learning || s.is_revision_only))
  ok('revision-only instruction is not a preference')
}

// --- 2. EDL diff extraction ---
{
  const diff: EdlDiff = {
    from_version: 1,
    to_version: 2,
    ops: [
      {
        kind: 'changed',
        path: 'timeline.HOOK',
        before: { scale: 1.2, duration_ms: 3000 },
        after: { scale: 1, duration_ms: 1800 },
        summary: 'Changed HOOK timing/scale/rate',
      },
      {
        kind: 'unchanged',
        path: 'timeline.BODY',
        summary: 'Unchanged BODY',
      },
    ],
    preserved_count: 1,
    changed_count: 1,
  }
  const signals = signalsFromEdlDiff({
    diff,
    feedback: 'Remove the zoom and make the hook faster. Keep everything else the same.',
    changed: ['Disabled zooms (scale=1)', 'Hook duration 3000ms → 1800ms'],
  })
  assert.ok(signals.some((s) => s.signal.includes('ZOOM') || s.preference_key === 'zoom_frequency'))
  assert.ok(signals.some((s) => s.preference_key === 'hook_pace' || s.signal.includes('HOOK')))
  ok('EDL diff → taste signals')
}

// --- 3–6. Candidate + confidence + strengthening + weak stays weak ---
{
  const map = new Map<string, TastePreference>()
  const s1 = parseTasteFeedback('Remove the zoom.')[0]
  const p1 = applySignalInMemory(map, { ...s1, is_revision_only: false, skip_learning: false })!
  assert.equal(p1.status, 'CANDIDATE')
  assert.ok(p1.confidence < ACTIVE_AUTO_THRESHOLD)
  const confAfterFirst = p1.confidence

  const s2 = parseTasteFeedback('Too many zooms again.')[0]
  const p2 = applySignalInMemory(map, {
    ...s2,
    evidence_type: 'EDL_REVISION',
    is_revision_only: false,
    skip_learning: false,
  })!
  assert.ok(p2.evidence_count >= 2)
  assert.ok(p2.confidence > confAfterFirst, 'repeated evidence strengthens')

  applySignalInMemory(map, {
    ...s2,
    evidence_type: 'EDL_REVISION',
    is_revision_only: false,
    skip_learning: false,
    signal: 'ZOOM_REDUCED_AGAIN',
  })
  const p3 = [...map.values()][0]
  assert.ok(p3.evidence_count >= 3)
  if (p3.confidence >= ACTIVE_AUTO_THRESHOLD && p3.evidence_count >= ACTIVE_MIN_EVIDENCE) {
    assert.equal(p3.status, 'ACTIVE')
  } else {
    assert.equal(p3.status, 'CANDIDATE')
  }

  const weak = signalsFromWeakRejection(null)
  assert.ok(weak.every((s) => s.skip_learning || s.confidence <= 0.05))
  ok('candidate / confidence / strengthen / weak rejection')
}

// --- 7. Rejection without feedback does not invent preference ---
{
  const map = new Map<string, TastePreference>()
  for (const s of signalsFromWeakRejection()) {
    const r = applySignalInMemory(map, s)
    assert.equal(r, null)
  }
  assert.equal(map.size, 0)
  ok('rejection without feedback does not create preference')
}

// --- 8–10. Conflict + contextual + precedence ---
{
  assert.equal(oppositePolarity('DECREASE', 'INCREASE'), true)
  assert.equal(oppositePolarity('PREFER', 'AVOID'), true)
  assert.equal(oppositePolarity('PREFER', 'PREFER'), false)

  const prefs: TastePreference[] = [
    {
      id: '1',
      scope: 'GLOBAL',
      scope_id: null,
      dimension: 'EDITING',
      preference_key: 'zoom_frequency',
      preference_value: 'restrained',
      polarity: 'DECREASE',
      influence_mode: 'STRONG_PREFERENCE',
      confidence: 0.82,
      evidence_count: 7,
      positive_evidence_count: 7,
      negative_evidence_count: 0,
      source_types: ['EXPLICIT_FEEDBACK', 'EDL_REVISION'],
      status: 'ACTIVE',
      signal_kind: 'USER_TASTE',
      explanation: 'restrained zooms',
      first_observed_at: new Date().toISOString(),
      last_observed_at: new Date().toISOString(),
      confirmed_at: null,
      rejected_at: null,
      memory_id: null,
      fingerprint: 'a',
      history: [],
    },
    {
      id: '2',
      scope: 'INSTAGRAM_REEL',
      scope_id: null,
      dimension: 'CAPTIONS',
      preference_key: 'caption_density',
      preference_value: 'minimal',
      polarity: 'DECREASE',
      influence_mode: 'SOFT_PREFERENCE',
      confidence: 0.6,
      evidence_count: 4,
      positive_evidence_count: 4,
      negative_evidence_count: 0,
      source_types: ['EDL_REVISION'],
      status: 'ACTIVE',
      signal_kind: 'USER_TASTE',
      explanation: null,
      first_observed_at: new Date().toISOString(),
      last_observed_at: new Date().toISOString(),
      confirmed_at: null,
      rejected_at: null,
      memory_id: null,
      fingerprint: 'b',
      history: [],
    },
    {
      id: '3',
      scope: 'GLOBAL',
      scope_id: null,
      dimension: 'PACING',
      preference_key: 'hook_pace',
      preference_value: 'fast',
      polarity: 'INCREASE',
      influence_mode: 'OBSERVATION',
      confidence: 0.45,
      evidence_count: 2,
      positive_evidence_count: 2,
      negative_evidence_count: 0,
      source_types: ['PERFORMANCE_SIGNAL'],
      status: 'CANDIDATE',
      signal_kind: 'AUDIENCE_SIGNAL',
      explanation: 'AUDIENCE_SIGNAL: fast hooks retain better',
      first_observed_at: new Date().toISOString(),
      last_observed_at: new Date().toISOString(),
      confirmed_at: null,
      rejected_at: null,
      memory_id: null,
      fingerprint: 'c',
      history: [],
    },
  ]

  const retrieved = retrieveTasteSync(prefs, {
    platform: 'instagram',
    format: 'reel',
    current_instruction: 'Actually use a dramatic zoom for this hook.',
  })
  assert.ok(
    retrieved.applied.some(
      (a) =>
        a.preference_key === 'zoom_frequency' &&
        a.reason.includes('Current user instruction')
    ),
    'current instruction overrides global restrained zoom'
  )
  assert.ok(
    retrieved.audience_signals.some((a) => a.signal_kind === 'AUDIENCE_SIGNAL'),
    'audience signals separated'
  )
  assert.ok(
    !retrieved.applied.some((a) => a.signal_kind === 'AUDIENCE_SIGNAL'),
    'audience not applied as user taste'
  )
  ok('conflict / contextual / instruction override / audience separation')
}

// --- 11–13. Confirm / reject status helpers ---
{
  const confirmed = resolveStatus({
    confidence: 0.7,
    evidence_count: 3,
    positive: 3,
    negative: 0,
    current: 'CANDIDATE',
    confirmed: true,
  })
  assert.equal(confirmed.status, 'ACTIVE')

  const rejected = resolveStatus({
    confidence: 0.8,
    evidence_count: 5,
    positive: 5,
    negative: 0,
    current: 'ACTIVE',
    rejected: true,
  })
  assert.equal(rejected.status, 'REJECTED')
  ok('preference confirmation / rejection status')
}

// --- 14. Staleness ---
{
  const decayed = decayConfidence(0.6, STALE_DAYS + 5)
  assert.ok(decayed.confidence < 0.6)
  const stale = resolveStatus({
    confidence: decayed.confidence,
    evidence_count: 4,
    positive: 4,
    negative: 0,
    current: 'ACTIVE',
    days_since_last: STALE_DAYS + 5,
  })
  assert.ok(stale.status === 'STALE' || decayed.confidence < CANDIDATE_THRESHOLD)
  ok('staleness decay')
}

// --- 15–17. Retrieval + CD/EDL apply ---
{
  const prefs: TastePreference[] = [
    {
      id: 'z',
      scope: 'GLOBAL',
      scope_id: null,
      dimension: 'EDITING',
      preference_key: 'zoom_frequency',
      preference_value: 'restrained',
      polarity: 'DECREASE',
      influence_mode: 'STRONG_PREFERENCE',
      confidence: 0.82,
      evidence_count: 7,
      positive_evidence_count: 7,
      negative_evidence_count: 0,
      source_types: ['EDL_REVISION'],
      status: 'ACTIVE',
      signal_kind: 'USER_TASTE',
      explanation: 'restrained',
      first_observed_at: new Date().toISOString(),
      last_observed_at: new Date().toISOString(),
      confirmed_at: null,
      rejected_at: null,
      memory_id: null,
      fingerprint: preferenceFingerprint({
        scope: 'GLOBAL',
        dimension: 'EDITING',
        preference_key: 'zoom_frequency',
        preference_value: 'restrained',
      }),
      history: [],
    },
  ]
  const taste = retrieveTasteSync(prefs, { platform: 'instagram', format: 'reel' })
  const effects = effectsFromRetrievedTaste(taste)
  assert.equal(effects.minimal_zooms, true)

  const edl = {
    id: null,
    creative_content_id: null,
    creative_version: null,
    session_id: null,
    version: 1,
    parent_edl_id: null,
    title: 't',
    objective: null,
    platform: 'instagram',
    format: 'reel',
    aspect_ratio: '9:16',
    target_duration_ms: 15000,
    timeline: [
      {
        id: '1',
        source_ref: 'jarvis-video://a',
        source_id: 'a',
        source_start_ms: 0,
        source_end_ms: 3000,
        timeline_start_ms: 0,
        timeline_end_ms: 3000,
        trim: null,
        crop: null,
        scale: 1.25,
        position: 'center',
        volume: 1,
        playback_rate: 1,
        transition_in: 'CUT',
        transition_out: 'CUT',
        purpose: 'HOOK',
        provenance: 'test',
        missing: false,
      },
    ],
    audio: { tracks: [] },
    captions: [],
    overlays: [{ id: 'o1', kind: 'HOOK_TEXT', text: 'a', start_ms: 0, end_ms: 2000, position: 'top', style: 'default', provenance: 't' }],
    transitions: ['CUT'],
    output: { width: 1080, height: 1920, fps: 30, format: 'mp4' },
    source_manifest: [],
    warnings: [],
    unsupported_features: [],
    estimated_render_cost_usd: 0.1,
    estimated_duration_ms: 3000,
    status: 'DRAFT',
    fingerprint: 'x',
    revision_reason: null,
    user_feedback: null,
    changed_operations: [],
    provider_agnostic: true,
  } as unknown as EditDecisionList

  const applied = applyTasteToEdl(edl, effects)
  assert.equal(applied.edl.timeline[0].scale, 1)
  assert.ok(applied.applied.length > 0)

  // Dramatic zoom instruction path: do not force restrain
  const dramatic = applyTasteToEdl(edl, effects, { dramatic_zoom_requested: true })
  assert.equal(dramatic.edl.timeline[0].scale, 1.25)
  ok('taste retrieval + Creative/EDL application + instruction wins')
}

// --- 18–20. Explanation provenance + evidence preservation semantics ---
{
  const pref: TastePreference = {
    id: 'p',
    scope: 'GLOBAL',
    scope_id: null,
    dimension: 'EDITING',
    preference_key: 'zoom_frequency',
    preference_value: 'restrained',
    polarity: 'DECREASE',
    influence_mode: 'STRONG_PREFERENCE',
    confidence: 0.91,
    evidence_count: 9,
    positive_evidence_count: 9,
    negative_evidence_count: 0,
    source_types: ['EXPLICIT_FEEDBACK'],
    status: 'ACTIVE',
    signal_kind: 'USER_TASTE',
    explanation: 'User repeatedly reduced zooms.',
    first_observed_at: new Date().toISOString(),
    last_observed_at: new Date().toISOString(),
    confirmed_at: null,
    rejected_at: null,
    memory_id: null,
    fingerprint: 'fp',
    history: [],
  }
  const explained = explainPreference({
    preference: pref,
    evidence: [
      {
        id: 'e1',
        preference_id: 'p',
        evidence_type: 'EXPLICIT_FEEDBACK',
        dimension: 'EDITING',
        preference_key: 'zoom_frequency',
        signal: 'REDUCE_ZOOM',
        direction: 'DECREASE',
        confidence: 0.35,
        signal_kind: 'USER_TASTE',
        scope: 'GLOBAL',
        scope_id: null,
        creative_content_id: null,
        edl_id: null,
        edl_version: 2,
        render_job_id: null,
        feedback_text: 'Remove the zoom.',
        diff_summary: 'Disabled zooms',
        extracted: {},
        fingerprint: 'ef',
        created_at: new Date().toISOString(),
      },
    ],
  })
  assert.equal(explained.ok, true)
  assert.match(explained.explanation, /zoom|restrained|repeatedly/i)
  assert.ok(explained.evidence_summaries.length >= 1)

  const noPref = explainEditChoice({
    choice: 'used center crop',
    matching: null,
    evidence: [],
  })
  assert.match(noPref, /not from a stored taste/i)
  ok('explanations require evidence; no fabrication')
}

// --- 21. No sensitive inference ---
{
  assert.equal(isSensitiveInferenceAttempt('He has an aggressive personality'), true)
  const blocked = parseTasteFeedback('Infer his political preferences from edits')
  assert.ok(blocked.some((s) => s.skip_learning && s.signal === 'SENSITIVE_INFERENCE_BLOCKED'))
  ok('no sensitive inference')
}

// --- Acceptance narrative: 3 zoom removals → candidate; dramatic zoom instruction wins ---
{
  const map = new Map<string, TastePreference>()
  for (const fb of ['Remove the zoom.', 'Too many zooms again.', 'Remove another zoom.']) {
    const sig = parseTasteFeedback(fb).find((s) => s.preference_key === 'zoom_frequency')!
    applySignalInMemory(map, {
      ...sig,
      evidence_type: 'EDL_REVISION',
      is_revision_only: false,
      skip_learning: false,
    })
  }
  const zoomPref = [...map.values()].find((p) => p.preference_key === 'zoom_frequency')!
  assert.ok(zoomPref.evidence_count >= 3)
  assert.ok(zoomPref.preference_value === 'restrained')

  const retrieved = retrieveTasteSync([zoomPref], {
    current_instruction: 'Actually use a dramatic zoom for this hook.',
  })
  assert.ok(
    retrieved.applied.some((a) => a.reason.includes('Current user instruction'))
  )
  assert.equal(zoomPref.preference_value, 'restrained')
  ok('acceptance: repeated zooms → candidate; dramatic zoom instruction overrides for turn')
}

async function checkTools() {
  ensureJarvisToolsRegistered()
  for (const name of [
    'creative.taste_profile',
    'creative.taste_preferences',
    'creative.taste_explain',
    'creative.taste_feedback',
    'creative.taste_confirm',
    'creative.taste_reject',
  ]) {
    const t = getTool(name)
    assert.ok(t, name)
    // Must not claim a publish capability (negated phrasing is fine)
    assert.doesNotMatch(t!.description, /\b(will publish|auto publishes|publishes to instagram)\b/i)
  }

  const readPerm = await evaluateToolPermission({
    toolName: 'creative.taste_profile',
    source: 'chat',
  })
  assert.equal(readPerm.allowed, true)

  const feedback = getTool('creative.taste_feedback')
  assert.equal(feedback!.riskClass, 'LOW_RISK')

  const fp1 = preferenceFingerprint({
    scope: 'GLOBAL',
    dimension: 'EDITING',
    preference_key: 'zoom_frequency',
    preference_value: 'restrained',
  })
  const fp2 = preferenceFingerprint({
    scope: 'GLOBAL',
    dimension: 'EDITING',
    preference_key: 'zoom_frequency',
    preference_value: 'restrained',
  })
  assert.equal(fp1, fp2)

  const conf = applyEvidenceWeight(0.2, 'EXPLICIT_FEEDBACK')
  assert.ok(conf.confidence > 0.2)
  assert.ok(clampConfidence(1.5) === 1)

  ok('tools / cost class / idempotent fingerprints / no auto-publish')
}

checkTools()
  .then(() => {
    console.log('\nAll Phase 7 taste engine verification checks passed.')
  })
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
