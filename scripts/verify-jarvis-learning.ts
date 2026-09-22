/**
 * Phase 3 Jarvis Memory + Learning Engine verification (offline unit checks).
 * Run: npm run verify:jarvis-learning
 */
import assert from 'node:assert/strict'
import {
  canonicalizeKind,
  categoryForKind,
  kindFromRow,
  validateMemoryWrite,
} from '../src/lib/jarvis/memory/kinds'
import {
  compareMetric,
  classifyOutcome,
} from '../src/lib/jarvis/memory/comparison'
import {
  observationalStatement,
  patternStrength,
  confidenceFromEvidence,
  defaultWindowForTool,
} from '../src/lib/jarvis/memory/scopes'
import {
  detectMemoryConflicts,
  formatMemoryForPrompt,
  planningHintsFromMemory,
  type RetrievedMemory,
} from '../src/lib/jarvis/memory/retrieval'
import {
  extractExplicitPreference,
  isVagueComplaint,
} from '../src/lib/jarvis/memory/preferences'
import { measurementKey } from '../src/lib/jarvis/memory/outcomes'
import { ensureJarvisToolsRegistered } from '../src/lib/jarvis/tools/builtins'
import { getTool, FORBIDDEN_TOOL_NAMES } from '../src/lib/jarvis/tools/registry'
import { evaluateToolPermission } from '../src/lib/jarvis/permissions/risk-engine'

function ok(label: string) {
  console.log(`✓ ${label}`)
}

// --- Memory kinds ---
{
  assert.equal(canonicalizeKind('FACT'), 'BUSINESS_FACT')
  assert.equal(canonicalizeKind('PREFERENCE'), 'USER_PREFERENCE')
  assert.equal(categoryForKind('OUTCOME'), 'outcome')
  assert.equal(categoryForKind('ACTION'), 'decision')
  assert.equal(
    kindFromRow({ category: 'outcome', tags: ['outcome_record'], details: { record_type: 'OUTCOME' } }),
    'OUTCOME'
  )

  const secret = validateMemoryWrite({
    kind: 'USER_PREFERENCE',
    source: 'user_explicit',
    summary: 'My api_key is sk-test-123',
  })
  assert.equal(secret.ok, false)

  const goodPref = validateMemoryWrite({
    kind: 'USER_PREFERENCE',
    source: 'user_explicit',
    summary: 'Never use excessive zooms in videos',
  })
  assert.equal(goodPref.ok, true)

  const causalHyp = validateMemoryWrite({
    kind: 'HYPOTHESIS',
    summary: 'Budget increase caused CPA to rise',
  })
  assert.equal(causalHyp.ok, false)

  ok('memory kinds + secret/causality gates')
}

// --- Comparison engine ---
{
  const under = compareMetric(
    { metric: 'cpa', baseline: 43, target: 50, direction: 'maintain', success_condition: '≤ 50' },
    55
  )
  assert.equal(under.against_target, 'missed')
  assert.ok(under.absolute_diff != null && under.absolute_diff > 0)
  assert.match(under.statement, /causality not established/i)

  const success = compareMetric(
    { metric: 'cpa', baseline: 43, target: 50, direction: 'maintain', success_condition: '≤ 50' },
    44
  )
  assert.equal(success.against_target, 'met')

  assert.equal(
    classifyOutcome({
      comparisons: [under],
    }),
    'UNDERPERFORMED'
  )
  assert.equal(
    classifyOutcome({
      comparisons: [success],
    }),
    'SUCCESS'
  )
  assert.equal(classifyOutcome({ comparisons: [], dataUnavailable: true }), 'UNAVAILABLE')
  assert.equal(classifyOutcome({ comparisons: [], actionFailed: true }), 'FAILED_ACTION')

  const noChange = compareMetric(
    { metric: 'cpa', baseline: 50, target: null, direction: 'maintain' },
    50
  )
  assert.equal(classifyOutcome({ comparisons: [noChange] }), 'NO_MEASURABLE_CHANGE')

  ok('comparison + outcome classification')
}

// --- Causality-safe language ---
{
  const stmt = observationalStatement({
    metric: 'CPA',
    before: 43,
    after: 55,
    windowHours: 48,
    actionLabel: 'budget ₹250→₹300',
  })
  assert.match(stmt, /during the 48-hour period/i)
  assert.match(stmt, /Causality is not established/)
  assert.doesNotMatch(stmt, /\bcaused\b/i)
  ok('observational (non-causal) statements')
}

// --- Sample size / confidence ---
{
  assert.equal(patternStrength(1).label, 'isolated_observation')
  assert.equal(patternStrength(3).label, 'emerging_pattern')
  assert.equal(patternStrength(5).label, 'stronger_repeated_pattern')
  assert.notEqual(patternStrength(5).confidence, 'high') // n=5 is medium max from patternStrength
  assert.equal(
    confidenceFromEvidence({
      sampleSize: 5,
      consistent: true,
      sourceReliable: true,
      freshnessDays: 3,
    }),
    'high'
  )
  ok('sample size + confidence helpers')
}

// --- Measurement windows ---
{
  assert.equal(defaultWindowForTool('meta.update_adset_budget'), 48)
  assert.equal(defaultWindowForTool('instagram.publish_reel'), 72)
  assert.equal(defaultWindowForTool('video.render'), 24)
  assert.equal(defaultWindowForTool('shopify.update_seo_title'), 168)
  assert.equal(measurementKey('dec-1', 48), 'dec-1:48h')
  ok('measurement windows + idempotent keys')
}

// --- Preferences ---
{
  assert.equal(isVagueComplaint("I don't like this"), true)
  assert.equal(isVagueComplaint('Never increase budgets by more than 15% without asking me.'), false)

  const pref = extractExplicitPreference('Never use aggressive zooms.')
  assert.ok(pref)
  assert.equal(pref!.kind, 'USER_PREFERENCE')
  assert.equal(pref!.scope, 'VIDEO_STYLE')

  const videoPref = extractExplicitPreference("I prefer minimal zooms")
  assert.ok(videoPref)
  assert.equal(videoPref!.kind, 'USER_PREFERENCE')
  assert.equal(videoPref!.scope, 'VIDEO_STYLE')

  const budgetRule = extractExplicitPreference(
    'Never increase budgets by more than 15% without asking me.'
  )
  assert.ok(budgetRule)
  assert.equal(budgetRule!.kind, 'OPERATING_RULE')

  ok('explicit preference extraction (no silent vague capture)')
}

// --- Retrieval priority + conflicts + planning hints ---
{
  const now = Date.now()
  const base = {
    category: 'preference',
    details: {},
    funnel_id: null,
    confidence: 'high',
    tags: [] as string[],
    source: 'user_explicit',
    expires_at: null,
    created_at: new Date(now).toISOString(),
    updated_at: new Date(now).toISOString(),
    memory_status: 'ACTIVE',
    scope: 'USER_PREFERENCE',
    scope_id: null,
    sample_size: null,
    evidence_label: null,
    relevance_score: 10,
    expired: false,
    priority_rank: 100,
  }

  const oldPref: RetrievedMemory = {
    ...base,
    id: 'old',
    title: 'Captions',
    summary: 'User prefers short captions',
    kind: 'USER_PREFERENCE',
    updated_at: new Date(now - 86400_000 * 10).toISOString(),
  }
  const newPref: RetrievedMemory = {
    ...base,
    id: 'new',
    title: 'Captions',
    summary: 'Keep captions minimal',
    kind: 'USER_PREFERENCE',
    updated_at: new Date(now).toISOString(),
  }
  const hyp: RetrievedMemory = {
    ...base,
    id: 'hyp',
    category: 'insight',
    title: 'Captions',
    summary: 'Aggressive captions may help CTR',
    kind: 'HYPOTHESIS',
    confidence: 'low',
    priority_rank: 40,
    relevance_score: 12,
  }
  const lesson: RetrievedMemory = {
    ...base,
    id: 'les',
    category: 'outcome',
    title: 'Captions',
    summary: 'Aggressive captions were followed by lower CTR in one window',
    kind: 'LESSON',
    confidence: 'medium',
    priority_rank: 70,
    relevance_score: 11,
  }
  const rule: RetrievedMemory = {
    ...base,
    id: 'rule',
    category: 'business_rule',
    title: 'Budget rule',
    summary: 'Never increase budget without approval',
    kind: 'OPERATING_RULE',
    priority_rank: 90,
  }

  const conflicts = detectMemoryConflicts([oldPref, newPref, hyp, lesson])
  assert.ok(conflicts.some((c) => c.preferred_id === 'new'))
  assert.ok(conflicts.some((c) => c.preferred_id === 'les' && c.discarded_id === 'hyp'))

  const formatted = formatMemoryForPrompt([rule, lesson, hyp], conflicts, {
    currentInstruction: 'For this campaign, make captions very aggressive.',
  })
  assert.equal(formatted.current_instruction, 'For this campaign, make captions very aggressive.')
  assert.ok(formatted.relevant.some((r) => r.role === 'constraint'))
  assert.ok(formatted.relevant.some((r) => r.role === 'evidence'))
  assert.match(formatted.planning_note, /overrides/i)

  const hints = planningHintsFromMemory([rule, lesson, newPref, hyp])
  assert.ok(hints.constraints.length === 1)
  assert.ok(hints.lessons.length === 1)
  assert.ok(hints.preferences.length === 1)
  assert.ok(hints.hypotheses.length === 1)

  ok('retrieval conflicts + planning hints (rules vs lessons)')
}

// --- Tools + permission cannot be bypassed by memory ---
async function checkToolsAndPermissions() {
  ensureJarvisToolsRegistered()
  const learnTool = getTool('memory.learning_query')
  assert.ok(learnTool)
  assert.equal(learnTool!.riskClass, 'READ')

  for (const name of FORBIDDEN_TOOL_NAMES) {
    const perm = await evaluateToolPermission({
      toolName: name,
      source: 'chat',
    })
    assert.equal(perm.allowed, false)
  }

  const significant = await evaluateToolPermission({
    toolName: 'meta.pause_campaign',
    source: 'chat',
  })
  // Memory never grants permission — SIGNIFICANT still gated
  assert.ok(
    significant.mode === 'require_approval' ||
      significant.mode === 'block' ||
      !significant.allowed
  )

  ok('learning tools registered; memory cannot invent forbidden tools')
}

// --- Scenario language: underperformed lesson ---
{
  const lesson = observationalStatement({
    metric: 'CPA',
    before: 43,
    after: 55,
    windowHours: 48,
    actionLabel: 'Increase Ad Set X daily budget from ₹250 to ₹300',
  })
  assert.match(lesson, /increased/)
  assert.doesNotMatch(lesson, /caused CPA/i)
  ok('scenario 1 / 8 language: temporal association only')
}

checkToolsAndPermissions()
  .then(() => {
    console.log('\nAll Phase 3 learning verification checks passed.')
  })
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
