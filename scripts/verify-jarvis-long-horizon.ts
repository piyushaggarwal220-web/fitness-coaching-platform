/**
 * Phase 21 long-horizon verification (offline).
 */
import assert from 'node:assert/strict'
import {
  prioritizeItems,
  assessPlanHealth,
} from '../src/lib/jarvis/strategy/long-horizon'
import { ensureJarvisToolsRegistered } from '../src/lib/jarvis/tools/builtins'
import { getTool } from '../src/lib/jarvis/tools/registry'
import { liveMetaExecutionEnabled } from '../src/lib/ai-marketing/autonomy'
import { liveInstagramPublishingEnabled } from '../src/lib/jarvis/instagram'
import { buildTakeCarePlan } from '../src/lib/jarvis/autonomous/tasks'

function ok(l: string) {
  console.log(`✓ ${l}`)
}

{
  const h = assessPlanHealth({
    status: 'ACTIVE',
    milestones: [],
    dependencies: [],
    risks: [],
    goalStatuses: [],
    openBlockers: 0,
    experimentsInconclusive: 0,
    metricAvailable: false,
  })
  assert.equal(h.health, 'UNKNOWN')
  ok('No fabricated plan progress when metrics unavailable')
}

{
  const h = assessPlanHealth({
    status: 'ACTIVE',
    milestones: [],
    dependencies: [],
    risks: [],
    goalStatuses: ['ACTIVE'],
    openBlockers: 2,
    experimentsInconclusive: 0,
    metricAvailable: true,
  })
  assert.equal(h.health, 'BLOCKED')
  ok('Blockers → BLOCKED health')
}

{
  const p = prioritizeItems([
    { id: 'a', title: 'crit', urgency: 'CRITICAL' },
    { id: 'b', title: 'low', urgency: 'LOW', impact: 'LOW' },
  ])
  assert.equal(p[0].band, 'CRITICAL')
  assert.ok(p[0].reasons.length > 0)
  ok('Priority engine returns explained bands')
}

{
  ensureJarvisToolsRegistered()
  assert.ok(getTool('strategy.long_horizon_review'))
  assert.ok(getTool('strategy.plan_health'))
  assert.ok(getTool('strategy.next_actions'))
  assert.ok(getTool('strategy.dependencies'))
  assert.ok(getTool('strategy.priorities'))
  assert.ok(getTool('strategy.resume'))
  assert.ok(getTool('strategy.replan_proposal'))
  assert.ok(getTool('strategy.attention'))
  assert.equal(getTool('strategy.execute_all'), undefined)
  ok('Long-horizon tools registered; no execute_all')
}

{
  const plan = buildTakeCarePlan('CPA rose on ₹99 funnel')
  assert.ok(plan.approval_required)
  assert.ok(plan.steps.some((s) => /does not bypass/i.test(s.why)))
  ok('"Take care of it" still requires approvals')
}

{
  assert.equal(liveMetaExecutionEnabled(), false)
  assert.equal(liveInstagramPublishingEnabled(), false)
  ok('Live Meta/IG remain OFF')
}

console.log('\nPhase 21 long-horizon verification passed.')
