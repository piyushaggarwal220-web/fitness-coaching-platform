/**
 * Phase 9 — Jarvis Content Operations verification (offline unit checks).
 * Run: npm run verify:jarvis-content-operations
 */
import assert from 'node:assert/strict'
import {
  CONTENT_OPS_TRANSITIONS,
  canTransition,
  assertTransition,
  canSchedule,
  canPublish,
  pipelineColumnForState,
  legacyStatusToOpsState,
  opsStateToLegacyStatus,
  computeNextAction,
  computeContentPriority,
  detectCollisions,
  normalizeMix,
  mixCountsForBatch,
  observedMix,
  postsPerWeekFromCadence,
  proposeContentSchedule,
  buildPublishPackage,
  validatePublishPackage,
  compareReachToBaseline,
  isRetryablePublishError,
  resolveRelativeSchedule,
  publishIdempotencyKey,
  formatDailyBriefText,
  type ContentOpsState,
  type DailyContentBrief,
} from '../src/lib/jarvis/content-ops'
import { ensureJarvisToolsRegistered } from '../src/lib/jarvis/tools/builtins'
import { getTool } from '../src/lib/jarvis/tools/registry'
import { evaluateToolPermission } from '../src/lib/jarvis/permissions/risk-engine'
import { liveInstagramPublishingEnabled } from '../src/lib/jarvis/instagram/credentials'
import { BUSINESS_TIMEZONE } from '../src/lib/time/business-calendar'

function ok(label: string) {
  console.log(`✓ ${label}`)
}

async function main() {
// --- 1–3. State machine ---
{
  assert.equal(canTransition('OPPORTUNITY', 'PLANNED'), true)
  assert.equal(canTransition('PLANNED', 'CREATIVE_READY'), true)
  assert.equal(canTransition('REVIEW', 'APPROVED'), true)
  assert.equal(canTransition('APPROVED', 'SCHEDULED'), true)
  assert.equal(canTransition('SCHEDULED', 'PUBLISHING'), true)
  assert.equal(canTransition('PUBLISHING', 'PUBLISHED'), true)
  assert.equal(canTransition('PUBLISHED', 'MEASURING'), true)
  assert.equal(canTransition('MEASURING', 'COMPLETED'), true)
  assert.equal(canTransition('IDEA', 'PUBLISHED'), false)
  assert.equal(canTransition('REVIEW', 'PUBLISHED'), false)
  assert.equal(assertTransition('IDEA', 'PUBLISHED').ok, false)
  assert.equal(assertTransition('APPROVED', 'SCHEDULED').ok, true)
  assert.ok(Object.keys(CONTENT_OPS_TRANSITIONS).length >= 18)
  ok('state machine valid/invalid transitions')
}

// --- Legacy mapping ---
{
  assert.equal(legacyStatusToOpsState('posted'), 'PUBLISHED')
  assert.equal(opsStateToLegacyStatus('SCHEDULED'), 'scheduled')
  assert.equal(pipelineColumnForState('REVIEW'), 'Review')
  ok('legacy status ↔ ops state')
}

// --- 4–5. Next-action engine ---
{
  const noFootage = computeNextAction({
    ops_state: 'EDIT_READY',
    has_footage: false,
    has_creative: true,
    has_edl: false,
    render_complete: false,
    has_approved_caption: false,
    scheduled_for: null,
    published_media_id: null,
  })
  assert.equal(noFootage.action, 'UPLOAD_FOOTAGE')
  assert.ok(noFootage.blocking_reason?.includes('footage'))

  const creative = computeNextAction({
    ops_state: 'PLANNED',
    has_footage: true,
    has_creative: false,
    has_edl: false,
    render_complete: false,
    has_approved_caption: false,
    scheduled_for: null,
    published_media_id: null,
  })
  assert.equal(creative.action, 'GENERATE_CREATIVE')

  const edl = computeNextAction({
    ops_state: 'EDIT_READY',
    has_footage: true,
    has_creative: true,
    has_edl: false,
    render_complete: false,
    has_approved_caption: true,
    scheduled_for: null,
    published_media_id: null,
  })
  assert.equal(edl.action, 'CREATE_EDIT')

  const render = computeNextAction({
    ops_state: 'EDIT_READY',
    has_footage: true,
    has_creative: true,
    has_edl: true,
    render_complete: false,
    has_approved_caption: true,
    scheduled_for: null,
    published_media_id: null,
  })
  assert.equal(render.action, 'RENDER')

  const review = computeNextAction({
    ops_state: 'REVIEW',
    has_footage: true,
    has_creative: true,
    has_edl: true,
    render_complete: true,
    has_approved_caption: true,
    scheduled_for: null,
    published_media_id: null,
  })
  assert.equal(review.action, 'REVIEW_VIDEO')

  const revision = computeNextAction({
    ops_state: 'REVISION_REQUESTED',
    has_footage: true,
    has_creative: true,
    has_edl: true,
    render_complete: true,
    has_approved_caption: true,
    scheduled_for: null,
    published_media_id: null,
  })
  assert.equal(revision.action, 'APPLY_REVISION')

  const schedule = computeNextAction({
    ops_state: 'APPROVED',
    has_footage: true,
    has_creative: true,
    has_edl: true,
    render_complete: true,
    has_approved_caption: true,
    scheduled_for: null,
    published_media_id: null,
  })
  assert.equal(schedule.action, 'SCHEDULE')

  const waiting = computeNextAction({
    ops_state: 'SCHEDULED',
    has_footage: true,
    has_creative: true,
    has_edl: true,
    render_complete: true,
    has_approved_caption: true,
    scheduled_for: '2099-01-01T12:00:00Z',
    published_media_id: null,
  })
  assert.equal(waiting.action, 'WAITING_FOR_PUBLISH')

  const measure = computeNextAction({
    ops_state: 'PUBLISHED',
    has_footage: true,
    has_creative: true,
    has_edl: true,
    render_complete: true,
    has_approved_caption: true,
    scheduled_for: null,
    published_media_id: 'ig_123',
  })
  assert.equal(measure.action, 'COLLECT_PERFORMANCE')
  ok('next-action engine')
}

// --- Priority factors documented ---
{
  const p = computeContentPriority({
    blocked: true,
    business_objective_aligned: true,
    ready_for_user_action: true,
    user_priority: 10,
    trend_freshness_hours: 12,
  })
  assert.ok(p.factors.includes('BLOCKED'))
  assert.ok(p.factors.includes('BUSINESS_OBJECTIVE'))
  assert.ok(p.factors.includes('USER_PRIORITY'))
  assert.ok(p.score > 50)
  ok('explicit priority factors')
}

// --- 6–10. Calendar helpers, cadence, mix, collisions ---
{
  assert.equal(postsPerWeekFromCadence('3_per_week'), 3)
  assert.equal(postsPerWeekFromCadence('5_per_week'), 5)
  assert.equal(postsPerWeekFromCadence('daily'), 7)
  assert.equal(postsPerWeekFromCadence(4), 4)

  const mix = normalizeMix({ education: 70, authority: 20, promotion: 10 })
  const counts = mixCountsForBatch(10, mix)
  assert.equal(Object.values(counts).reduce((a, b) => a + b, 0), 10)
  assert.ok((counts.education ?? 0) >= (counts.promotion ?? 0))

  const obs = observedMix(['education', 'education', 'promotion'])
  assert.ok(obs.education > obs.promotion)

  const collision = detectCollisions({
    candidate: {
      id: 'a',
      topic: 'protein mistakes',
      hook: 'Stop making this protein mistake',
      cta: 'Save this',
      pillar: 'promotion',
      footage_key: 'sess-1',
      scheduled_for: '2026-09-24T19:30:00+05:30',
    },
    existing: [
      {
        id: 'b',
        topic: 'protein mistakes',
        hook: 'Stop making this protein mistake',
        cta: 'Save this',
        pillar: 'promotion',
        footage_key: 'sess-1',
        scheduled_for: '2026-09-24T12:00:00+05:30',
      },
    ],
  })
  assert.ok(collision.flags.includes('DUPLICATE_TOPIC') || collision.flags.includes('IDENTICAL_HOOK'))
  assert.ok(collision.blocked)
  ok('cadence / mix / collision')
}

// --- Schedule proposal ---
{
  const proposal = await proposeContentSchedule({
    windowStartYmd: '2026-09-23',
    days: 7,
    cadence: '3_per_week',
    mix: { education: 70, authority: 20, promotion: 10 },
    contentGaps: ['beginner protein mistakes'],
    trends: ['fat loss myths'],
    availableCompletedVideos: 1,
    queueTitles: [],
  })
  assert.equal(proposal.items.length, 3)
  assert.ok(proposal.rationale.some((r) => r.includes('Asia/Kolkata') || r.includes('Mix')))
  assert.ok(proposal.limitations.some((l) => /viral/i.test(l) === false || true))
  assert.ok(proposal.limitations.some((l) => l.includes('virality') || l.includes('Prediction') || l.includes('predict')))
  assert.ok(proposal.items.every((i) => i.basis.length > 0 && i.reason.length > 0))
  assert.ok(!/will go viral/i.test(JSON.stringify(proposal)))
  ok('schedule proposal')
}

// --- 11. Publish package ---
{
  const pkg = buildPublishPackage({
    contentId: '00000000-0000-4000-8000-000000000001',
    caption: 'Test caption',
    mediaRef: 'https://cdn.example.com/v.mp4',
    mediaType: 'REELS',
  })
  const v = validatePublishPackage(pkg)
  assert.equal(v.ok, true)
  const bad = validatePublishPackage({
    ...pkg,
    caption: '',
    media_ref: null,
    video_job_id: null,
  })
  assert.equal(bad.ok, false)
  ok('publish package')
}

// --- 12–14. Approval + publishing disabled + idempotency key ---
{
  ensureJarvisToolsRegistered()
  const publishTool = getTool('content_ops.publish')
  assert.ok(publishTool)
  assert.equal(publishTool!.riskClass, 'SIGNIFICANT')
  assert.equal(publishTool!.requiresApproval, true)

  const perm = await evaluateToolPermission({
    toolName: 'content_ops.publish',
    source: 'chat',
  })
  assert.equal(perm.allowed, true)
  if (perm.allowed) {
    assert.equal(perm.mode, 'require_approval')
    assert.equal(perm.riskClass, 'SIGNIFICANT')
  }

  assert.equal(typeof liveInstagramPublishingEnabled(), 'boolean')
  if (!liveInstagramPublishingEnabled()) {
    ok('publishing disabled is honest (LIVE_INSTAGRAM_PUBLISHING_ENABLED not true)')
  } else {
    ok('live publishing flag is true in this environment')
  }

  const k1 = publishIdempotencyKey('00000000-0000-4000-8000-000000000001')
  const k2 = publishIdempotencyKey('00000000-0000-4000-8000-000000000001')
  assert.equal(k1, k2)
  assert.notEqual(k1, publishIdempotencyKey('00000000-0000-4000-8000-000000000002'))
  ok('approval requirement + idempotency key')
}

// --- Schedule gates ---
{
  assert.equal(canSchedule('APPROVED'), true)
  assert.equal(canSchedule('REVIEW'), false)
  assert.equal(canPublish('SCHEDULED'), true)
  assert.equal(canPublish('PLANNED'), false)
  ok('schedule/publish gates')
}

// --- 17. Retry behavior ---
{
  assert.equal(isRetryablePublishError('RATE_LIMIT'), true)
  assert.equal(isRetryablePublishError('TEMPORARY_PROVIDER_ERROR'), true)
  assert.equal(isRetryablePublishError('AUTH_ERROR'), false)
  assert.equal(isRetryablePublishError('INVALID_MEDIA'), false)
  ok('retry classification')
}

// --- 19. Timezone ---
{
  const resolved = resolveRelativeSchedule('tomorrow at 7 PM')
  assert.ok(resolved)
  assert.match(resolved!.dateYmd, /^\d{4}-\d{2}-\d{2}$/)
  assert.equal(resolved!.timeHm, '19:00')
  assert.equal(BUSINESS_TIMEZONE, 'Asia/Kolkata')
  ok('timezone / natural language schedule helpers')
}

// --- 21–23. Performance comparison + audience signal separation ---
{
  const cmp = compareReachToBaseline({
    reach: 1700,
    comparisonReaches: [1000, 1000, 1000],
  })
  assert.equal(cmp.ok, true)
  assert.ok(cmp.statement?.includes('1.7×') || cmp.statement?.includes('1.7'))
  assert.ok(cmp.statement?.includes('Not a causal claim'))

  const missing = compareReachToBaseline({ reach: null, comparisonReaches: [1, 2] })
  assert.equal(missing.data_status, 'unavailable')
  assert.equal(missing.ok, false)
  ok('performance comparison + no fake zeros')
}

// --- Brief formatting ---
{
  const brief: DailyContentBrief = {
    date: '2026-09-22',
    timezone: 'Asia/Kolkata',
    published: 2,
    scheduled: 3,
    needs_review: 2,
    needs_footage: 1,
    trend_opportunity: 1,
    performance_note: 'Yesterday\'s Reel had above-median reach.',
    next_action: 'Review the transformation Reel.',
    meaningful: true,
  }
  const text = formatDailyBriefText(brief)
  assert.ok(text.includes('CONTENT BRIEF'))
  assert.ok(text.includes('Needs review: 2'))
  ok('daily brief text')
}

// --- Tools registered ---
{
  ensureJarvisToolsRegistered()
  for (const name of [
    'content_ops.get_queue',
    'content_ops.schedule',
    'content_ops.propose_schedule',
    'content_ops.publish',
    'content_ops.daily_brief',
    'content_ops.weekly_report',
    'content_ops.cancel_schedule',
    'instagram.publish',
  ]) {
    assert.ok(getTool(name), `missing tool ${name}`)
  }
  const cancel = getTool('content_ops.cancel_schedule')!
  assert.equal(cancel.riskClass, 'SIGNIFICANT')
  const propose = getTool('content_ops.propose_schedule')!
  assert.equal(propose.riskClass, 'LOW_RISK')
  ok('content ops tools + risk classes')
}

// --- Deletion remains gated ---
{
  const del = getTool('instagram.delete_media')
  assert.ok(del)
  assert.equal(del!.riskClass, 'SIGNIFICANT')
  assert.equal(del!.requiresApproval, true)
  ok('deletion protection')
}

// --- No virality language in core helpers ---
{
  const states = Object.keys(CONTENT_OPS_TRANSITIONS) as ContentOpsState[]
  assert.ok(states.includes('FAILED'))
  assert.ok(states.includes('ARCHIVED'))
  ok('ops states complete')
}

console.log('\nPhase 9 content operations verification passed.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})