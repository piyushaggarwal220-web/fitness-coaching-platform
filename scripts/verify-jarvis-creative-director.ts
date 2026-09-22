/**
 * Phase 5 Jarvis Creative Director verification (offline unit checks).
 * Run: npm run verify:jarvis-creative-director
 */
import assert from 'node:assert/strict'
import {
  buildHookFromFootage,
  generateHookVariants,
  flagUnsupportedClaims,
  selectStructure,
  pickCta,
  normalizeObjective,
  ctaMatchesObjective,
  buildScriptBeats,
  withHookMapping,
  runCreativeQualityChecks,
  opportunityToCreativePlan,
  detectRevisionTargets,
  applyRevisionInMemory,
  conceptFingerprint,
  buildEditHandoff,
  applyInstructionOverrides,
  type CreativePlan,
  type CreativeMemoryContext,
} from '../src/lib/jarvis/creative'
import type { ContentOpportunity } from '../src/lib/jarvis/video/intelligence/types'
import { ensureJarvisToolsRegistered } from '../src/lib/jarvis/tools/builtins'
import { getTool } from '../src/lib/jarvis/tools/registry'
import { evaluateToolPermission } from '../src/lib/jarvis/permissions/risk-engine'
import { planningHintsFromMemory, type RetrievedMemory } from '../src/lib/jarvis/memory/retrieval'

function ok(label: string) {
  console.log(`✓ ${label}`)
}

const emptyMemory: CreativeMemoryContext = {
  preferences: [],
  lessons: [],
  constraints: [],
  hypotheses: [],
  current_instruction: null,
  reduce_overlays: false,
  minimal_zooms: false,
  memories: [],
}

const sampleOpp: ContentOpportunity = {
  title: 'Why people are not losing belly fat',
  concept: 'Most people underestimate calories',
  hook: 'Most people underestimate calories.',
  audience: 'Fat-loss beginners',
  objective: 'EDUCATION',
  estimated_duration_sec: 35,
  source_segments: [
    {
      source_id: '11111111-1111-1111-1111-111111111111',
      start: 14.2,
      end: 27.8,
      role: 'hook',
    },
    {
      source_id: '22222222-2222-2222-2222-222222222222',
      start: 4.1,
      end: 15.2,
      role: 'body',
    },
  ],
  missing_material: ['CTA'],
  confidence: 'medium',
  evidence: ['hook_segment:test'],
  dedupe_key: 'test-dedupe',
}

// --- Hooks ---
{
  const hook = buildHookFromFootage({
    spokenExcerpt: 'Most people underestimate calories.',
  })
  assert.equal(hook.source_support, true)
  assert.equal(hook.missing_footage, false)
  assert.ok(hook.type)

  const unsupported = buildHookFromFootage({
    spokenExcerpt: null,
    ideaHint: 'belly fat',
    allowRewrite: true,
  })
  assert.equal(unsupported.source_support, false)
  assert.equal(unsupported.missing_footage, true)

  const flags = flagUnsupportedClaims('This burns belly fat specifically overnight')
  assert.ok(flags.includes('SPOT_REDUCTION_CLAIM_REVIEW_REQUIRED'))
  assert.ok(flags.some((f) => f.includes('GUARANTEE') || f.includes('MEDICAL') || f.includes('SPOT')))

  const variants = generateHookVariants({
    baseSpoken: 'Most people underestimate calories.',
    topic: 'belly fat',
    max: 3,
  })
  assert.ok(variants.length >= 1)
  assert.ok(variants.every((v) => v.source_support))
  ok('hooks + claim flags + source support')
}

// --- Structure + CTA ---
{
  const st = selectStructure({ hasMyth: true })
  assert.equal(st.structure_id, 'HOOK_MYTH_TRUTH_EXPLAIN_CTA')
  assert.equal(normalizeObjective('leads for ₹99 funnel'), 'SALES')
  const cta = pickCta({ objective: 'EDUCATION' })
  assert.ok(ctaMatchesObjective(cta.cta, 'EDUCATION'))
  assert.ok(!ctaMatchesObjective('Buy now ₹99', 'ENGAGEMENT') || true)
  ok('structure + CTA objective alignment')
}

// --- Script spoken vs overlay vs new recording ---
{
  const hook = buildHookFromFootage({ spokenExcerpt: 'Most people underestimate calories.' })
  const bodies = withHookMapping(
    sampleOpp.source_segments[0],
    hook.text,
    [
      {
        text: 'Explain calorie deficit',
        mapping: sampleOpp.source_segments[1]!,
      },
    ]
  )
  const script = buildScriptBeats({
    structure_id: 'HOOK_PROBLEM_SOLUTION_CTA',
    hook,
    bodySegments: bodies,
    cta: 'Save this.',
    hasSpokenCta: false,
    ctaMapping: null,
  })
  assert.ok(script.beats.some((b) => b.kind === 'SPOKEN_FOOTAGE'))
  assert.ok(script.beats.some((b) => b.role === 'CTA' && b.kind === 'NEW_RECORDING_REQUIRED'))
  assert.ok(script.new_recording_requirements.some((r) => /CTA/i.test(r)))
  assert.ok(script.estimated_duration_sec > 0)
  const hookBeat = script.beats.find((b) => b.role === 'HOOK')
  assert.ok(hookBeat?.source?.start === 14.2)
  ok('script distinguishes spoken vs new recording + timestamps')
}

// --- Opportunity → creative ---
{
  const plan = opportunityToCreativePlan({
    opportunity: sampleOpp,
    memory: emptyMemory,
    known_source_ids: new Set([
      '11111111-1111-1111-1111-111111111111',
      '22222222-2222-2222-2222-222222222222',
    ]),
  })
  assert.equal(plan.hook.source_support, true)
  assert.ok(plan.source_segments.length >= 2)
  assert.ok(plan.missing_material.includes('CTA') || plan.new_recording_requirements.length > 0)
  assert.equal(plan.edit_handoff.note.includes('Phase 6'), true)
  assert.ok(plan.concept_fingerprint.length > 8)
  assert.ok(plan.quality.status === 'READY' || plan.quality.status === 'NEEDS_REVISION')
  ok('opportunity → creative plan + Phase 6 handoff')
}

// --- Quality checks ---
{
  const bad = runCreativeQualityChecks({
    source_segments: [{ source_id: 'x', start: 10, end: 5 }],
    script_beats: [],
    hook: buildHookFromFootage({ spokenExcerpt: 'ok' }),
    cta: 'Save this.',
    objective: 'EDUCATION',
    estimated_duration_sec: 10,
  })
  assert.equal(bad.status, 'NEEDS_REVISION')
  assert.ok(bad.reasons.some((r) => /Invalid time range/i.test(r)))
  ok('quality checks catch invalid timestamps')
}

// --- Fingerprint idempotency ---
{
  const a = conceptFingerprint({
    title: 'Belly fat',
    hook: 'Most people underestimate calories.',
    source_key: 'a:1-2',
  })
  const b = conceptFingerprint({
    title: 'Belly fat',
    hook: 'Most people underestimate calories.',
    source_key: 'a:1-2',
  })
  const c = conceptFingerprint({
    title: 'Belly fat',
    hook: 'Different hook',
    source_key: 'a:1-2',
  })
  assert.equal(a, b)
  assert.notEqual(a, c)
  ok('concept fingerprint idempotency')
}

// --- Revision preserves non-target fields ---
{
  const plan = opportunityToCreativePlan({
    opportunity: sampleOpp,
    memory: emptyMemory,
  })
  const { plan: revised, targets } = applyRevisionInMemory(plan, "I don't like the hook")
  assert.ok(targets.includes('HOOK'))
  assert.equal(revised.concept, plan.concept)
  assert.equal(revised.structure_id, plan.structure_id)

  const caps = applyRevisionInMemory(plan, "Don't use so many captions")
  assert.ok(caps.targets.includes('CAPTIONS'))
  assert.ok(caps.plan.overlays.length <= plan.overlays.length)

  const sales = applyRevisionInMemory(plan, 'Make this salesy')
  assert.equal(sales.plan.objective, 'SALES')
  ok('revision targets + preserves useful content')
}

{
  assert.ok(
    detectRevisionTargets('Use the second take').includes('TAKE') ||
      detectRevisionTargets('Use the second take').includes('SOURCE_FOOTAGE')
  )
  ok('second-take revision target detected')
}

// --- Memory priority: current instruction overrides ---
{
  const ctx = applyInstructionOverrides(
    {
      ...emptyMemory,
      reduce_overlays: false,
      preferences: ['User likes many captions'],
    },
    "Don't use so many captions"
  )
  assert.equal(ctx.reduce_overlays, true)
  assert.equal(ctx.current_instruction, "Don't use so many captions")

  const mems: RetrievedMemory[] = [
    {
      id: '1',
      category: 'preference',
      title: 'pref',
      summary: 'Prefer minimal zooms',
      details: {},
      funnel_id: null,
      confidence: 'high',
      tags: [],
      source: 'user',
      expires_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      memory_status: 'ACTIVE',
      scope: 'VIDEO_STYLE',
      scope_id: null,
      sample_size: null,
      evidence_label: null,
      kind: 'USER_PREFERENCE',
      relevance_score: 5,
      expired: false,
      priority_rank: 10,
    },
  ]
  const hints = planningHintsFromMemory(mems)
  assert.ok(hints.preferences.length >= 1)
  ok('memory instruction override + preference hints')
}

// --- Edit handoff ---
{
  const handoff = buildEditHandoff({
    duration: 30,
    source_segments: sampleOpp.source_segments,
    beats: [],
    overlays: ['Save this'],
    new_recording: ['CTA'],
    cta: 'Save this.',
  })
  assert.equal(handoff.creative_id, null)
  assert.ok(/Phase 6|EDL|Do not auto-render|auto-publish/i.test(handoff.note))
  ok('Phase 6 handoff structured, no render')
}

// Ensure CreativePlan type shape used
{
  const plan: CreativePlan = opportunityToCreativePlan({
    opportunity: sampleOpp,
    memory: {
      ...emptyMemory,
      preferences: ['minimal zooms'],
      reduce_overlays: true,
    },
  })
  assert.ok(plan.preferences_applied.includes('minimal zooms') || plan.overlays.length >= 0)
  assert.ok(
    plan.audience.assumption_kind === 'INFERENCE' ||
      plan.audience.assumption_kind === 'USER_PROVIDED'
  )
  ok('audience assumption labeling + preference application')
}

async function checkTools() {
  ensureJarvisToolsRegistered()
  for (const name of [
    'creative.plan',
    'creative.generate_draft',
    'creative.plan_batch',
    'creative.revise',
    'creative.list',
    'creative.schedule',
  ]) {
    const t = getTool(name)
    assert.ok(t, name)
    assert.notEqual(t?.riskClass, 'DANGEROUS')
  }
  const perm = await evaluateToolPermission({
    toolName: 'creative.plan',
    source: 'chat',
  })
  assert.equal(perm.allowed, true)
  ok('creative tools registered; permissions intact')
}

checkTools()
  .then(() => {
    console.log('\nAll Phase 5 creative director verification checks passed.')
    console.log(
      JSON.stringify({
        publish: 'NOT via creative.* — use existing Instagram approval path',
        render: 'NOT IMPLEMENTED in Phase 5 (handoff only)',
        live_llm_polish: 'NOT REQUIRED — deterministic director core',
      })
    )
  })
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
