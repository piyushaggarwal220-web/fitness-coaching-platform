/**
 * Phase 1 Jarvis core brain verification (offline unit checks).
 * Run: npm run verify:jarvis-core
 */
import assert from 'node:assert/strict'
import {
  categoryForKind,
  kindFromRow,
  validateMemoryWrite,
} from '../src/lib/jarvis/memory/kinds'
import { detectMemoryConflicts, formatMemoryForPrompt } from '../src/lib/jarvis/memory/retrieval'
import type { RetrievedMemory } from '../src/lib/jarvis/memory/retrieval'
import {
  buildDurablePlanFromToolCalls,
  summarizePlanForPrompt,
} from '../src/lib/jarvis/core/durable-plan'
import {
  buildApprovalBriefing,
  enrichmentForApprovalRow,
} from '../src/lib/jarvis/permissions/approval-briefing'
import {
  boundedToolCatalogForPrompt,
  selectToolFamiliesForObjective,
} from '../src/lib/jarvis/tools/selection'
import {
  detectProactiveFindings,
  notificationKindForSeverity,
} from '../src/lib/jarvis/workers/proactive'
import { ensureJarvisToolsRegistered } from '../src/lib/jarvis/tools/builtins'
import { getTool, FORBIDDEN_TOOL_NAMES } from '../src/lib/jarvis/tools/registry'
import { evaluateToolPermission } from '../src/lib/jarvis/permissions/risk-engine'
import { memoryGroup } from '../src/lib/jarvis/operator-present'
import { normalizeJarvisPlanOutput, jarvisPlanSchema } from '../src/lib/jarvis/core/plan'

function ok(label: string) {
  console.log(`✓ ${label}`)
}

// --- Memory kinds + validation ---
{
  assert.equal(categoryForKind('USER_PREFERENCE'), 'preference')
  assert.equal(categoryForKind('LESSON'), 'outcome')
  assert.equal(categoryForKind('HYPOTHESIS'), 'insight')
  assert.equal(
    kindFromRow({ category: 'insight', tags: ['hypothesis'], details: {} }),
    'HYPOTHESIS'
  )

  const badFact = validateMemoryWrite({
    kind: 'BUSINESS_FACT',
    source: 'jarvis',
    summary: 'CPA target is 45',
  })
  assert.equal(badFact.ok, false)

  const goodFact = validateMemoryWrite({
    kind: 'BUSINESS_FACT',
    source: 'marketing_funnels.config',
    summary: '₹99 funnel target CPA is ₹45',
  })
  assert.equal(goodFact.ok, true)

  const badLesson = validateMemoryWrite({
    kind: 'LESSON',
    source: 'model',
    summary: 'Budget up caused CPA up',
    evidence: [],
  })
  assert.equal(badLesson.ok, false)

  const goodLesson = validateMemoryWrite({
    kind: 'LESSON',
    source: 'jarvis.outcome',
    summary: 'Budget increase was followed by CPA rising from 42 to 61 over 48h',
    evidence: ['task:abc', 'cpa_before:42', 'cpa_after:61'],
  })
  assert.equal(goodLesson.ok, true)

  const badHyp = validateMemoryWrite({
    kind: 'HYPOTHESIS',
    summary: 'Creative fatigue causes CPA to increase',
  })
  assert.equal(badHyp.ok, false)

  const goodHyp = validateMemoryWrite({
    kind: 'HYPOTHESIS',
    summary: 'Creative fatigue may be a possible contributor to CPA increase',
  })
  assert.equal(goodHyp.ok, true)

  ok('memory kinds + write validation')
}

// --- Conflicts ---
{
  const now = Date.now()
  const base = {
    category: 'preference',
    details: { memory_kind: 'USER_PREFERENCE' as const },
    funnel_id: null,
    confidence: 'high',
    tags: [] as string[],
    source: 'user_explicit',
    expires_at: null,
    relevance_score: 5,
    expired: false,
    kind: 'USER_PREFERENCE' as const,
  }
  const memories: RetrievedMemory[] = [
    {
      ...base,
      id: '1',
      title: 'caption style preference',
      summary: 'Prefer minimal captions',
      created_at: new Date(now - 86400000).toISOString(),
      updated_at: new Date(now - 86400000).toISOString(),
    },
    {
      ...base,
      id: '2',
      title: 'caption style preference',
      summary: 'Prefer longer storytelling captions',
      created_at: new Date(now).toISOString(),
      updated_at: new Date(now).toISOString(),
    },
  ]
  const conflicts = detectMemoryConflicts(memories)
  assert.ok(conflicts.length >= 1)
  assert.equal(conflicts[0].preferred_id, '2')
  const formatted = formatMemoryForPrompt(memories, conflicts)
  assert.equal(formatted.conflicts[0].using.includes('longer'), true)
  ok('memory conflict resolution prefers newer preference')
}

// --- Durable plans ---
{
  const plan = buildDurablePlanFromToolCalls({
    objective: 'Why are sales down?',
    thinkingSummary: 'Inspect revenue, Meta, then Instagram',
    toolCalls: [
      { tool: 'lurvox.revenue', input: { preset: 'yesterday' }, why: 'cash sales' },
      { tool: 'analytics.investigate', input: { objective: 'sales down' }, why: 'cross-system' },
    ],
  })
  assert.equal(plan.version, 1)
  assert.equal(plan.status, 'running')
  assert.equal(plan.steps.length, 2)
  assert.equal(plan.steps[0].status, 'pending')
  assert.equal(plan.steps[1].depends_on[0], 'step_1')
  const summary = summarizePlanForPrompt(plan)
  assert.equal((summary.steps as unknown[]).length, 2)
  ok('durable multi-step plan object model')
}

// --- Approval briefing ---
{
  const briefing = buildApprovalBriefing({
    toolName: 'meta.update_campaign_budget',
    riskClass: 'SIGNIFICANT',
    riskLevel: 'high',
    reason: 'CPA below target for 3 days',
    toolInput: {
      campaignId: 'camp_99',
      current_budget: 500,
      daily_budget: 650,
    },
    estimatedCostUsd: 0.02,
  })
  assert.match(briefing.what, /500/)
  assert.match(briefing.what, /650/)
  assert.equal(briefing.target, 'camp_99')
  assert.ok(['easy', 'moderate', 'difficult'].includes(briefing.reversibility))
  const enriched = enrichmentForApprovalRow(briefing)
  assert.ok(enriched.evidence.some((e) => e.startsWith('WHAT:')))
  assert.ok(enriched.evidence.some((e) => e.startsWith('WHY:')))
  assert.ok(enriched.evidence.some((e) => e.startsWith('RISK:')))
  assert.notEqual(briefing.what.toLowerCase(), 'should i do it?')
  ok('approval briefing is specific (WHAT/WHY/TARGET/RISK/COST)')
}

// --- Tool selection ---
{
  ensureJarvisToolsRegistered()
  const families = selectToolFamiliesForObjective('Why did Instagram and Meta ads change?')
  assert.ok(families.includes('INSTAGRAM'))
  assert.ok(families.includes('MARKETING'))
  const catalog = boundedToolCatalogForPrompt('How much LURVOX revenue yesterday?')
  assert.match(catalog, /lurvox\.revenue/)
  assert.match(catalog, /Tool families/)
  assert.ok(!catalog.toLowerCase().includes('api_key'))
  assert.ok(!catalog.toLowerCase().includes('secret'))
  ok('bounded tool selection by objective')
}

// --- Proactive severity ---
{
  const quiet = detectProactiveFindings({
    funnelPerformance: {
      byFunnel: [
        {
          funnel_name: '₹99',
          classified: true,
          spend: 100,
          cpa: 40,
          max_acceptable_cpa: 80,
          target_cpa: 45,
          initial_roas: 2,
          target_roas: 1.5,
        },
      ],
      unclassified: { spend: 0 },
    },
  })
  assert.equal(quiet.shouldNotify, false)

  const critical = detectProactiveFindings({
    funnelPerformance: {
      byFunnel: [
        {
          funnel_name: '₹99',
          classified: true,
          spend: 2000,
          cpa: 120,
          max_acceptable_cpa: 80,
          target_cpa: 45,
          initial_roas: 0.4,
          target_roas: 1.5,
        },
      ],
      unclassified: { spend: 0 },
    },
  })
  assert.equal(critical.severity, 'CRITICAL')
  assert.equal(critical.shouldNotify, true)
  assert.equal(notificationKindForSeverity('CRITICAL'), 'alert')

  const revenueDrop = detectProactiveFindings({
    funnelPerformance: { byFunnel: [], unclassified: { spend: 0 } },
    lurvox: { ok: true, today_gross_inr: 500, yesterday_gross_inr: 5000 },
  })
  assert.ok(revenueDrop.findings.some((f) => f.source === 'lurvox.purchases'))
  ok('proactive severity + no-spam quiet cycles')
}

// --- Investigation tool registered with bounds ---
{
  ensureJarvisToolsRegistered()
  const inv = getTool('analytics.investigate')
  assert.ok(inv)
  assert.equal(inv!.riskClass, 'LOW_RISK')
  const parsed = inv!.inputSchema.safeParse({
    objective: 'Why are sales down?',
    max_tool_calls: 4,
    max_cost_usd: 0.2,
  })
  assert.equal(parsed.success, true)
  ok('analytics.investigate accepts bounded inputs')
}

// --- Security unchanged ---
async function checkSecurity() {
  for (const name of FORBIDDEN_TOOL_NAMES) {
    const perm = await evaluateToolPermission({
      toolName: name,
      source: 'chat',
    })
    assert.equal(perm.allowed, false)
  }
  const dangerous = await evaluateToolPermission({
    toolName: 'system.raise_budget',
    source: 'chat',
  })
  assert.equal(dangerous.allowed, false)
  ok('forbidden/dangerous tools remain blocked')
}

void checkSecurity()
  .then(() => {
    // --- Plan normalization still works ---
    const normalized = normalizeJarvisPlanOutput({
      thinking_summary: 'Check revenue',
      tool_calls: [{ name: 'lurvox.revenue', arguments: { preset: 'today' } }],
    })
    const parsed = jarvisPlanSchema.parse(normalized)
    assert.equal(parsed.tool_calls[0].tool, 'lurvox.revenue')
    assert.ok(parsed.tool_calls[0].why)
    ok('plan normalization still maps Luna tool calls')

    assert.equal(memoryGroup('insight'), 'HYPOTHESES')
    assert.equal(memoryGroup('outcome'), 'LEARNINGS')
    assert.equal(memoryGroup('preference'), 'PREFERENCES')
    ok('memory UI groups include hypotheses')

    console.log('\nAll Jarvis Phase 1 core checks passed.')
  })
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
