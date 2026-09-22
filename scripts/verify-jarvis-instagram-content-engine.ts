/**
 * Phase 8 Jarvis Instagram Content / Niche Intelligence verification (offline).
 * Run: npm run verify:jarvis-instagram-content-engine
 */
import assert from 'node:assert/strict'
import {
  parseMetric,
  classifyVirality,
  analyzeReelFromText,
  reelRefFromResearchHit,
  extractHookPatterns,
  extractTopicPatterns,
  extractRepetitionSignals,
  detectContentGaps,
  originalityFromTrend,
  forbidCopyLanguage,
  generateOpportunities,
  matchTrendToTaste,
  matchTrendToFootage,
  matchTrendToBusiness,
  inferNiche,
  inferGeography,
  windowHoursFromLabel,
  windowLabel,
  geographySignalLabel,
  containsCausalClaim,
  VIRALITY_GUARANTEE_FORBIDDEN,
  externalInstagramGraphCapability,
  type ViralReelRef,
} from '../src/lib/jarvis/instagram/niche'
import { ensureJarvisToolsRegistered } from '../src/lib/jarvis/tools/builtins'
import { getTool } from '../src/lib/jarvis/tools/registry'
import { evaluateToolPermission } from '../src/lib/jarvis/permissions/risk-engine'
import { isBraveSearchConfigured } from '../src/lib/jarvis/research/brave-search'

function ok(label: string) {
  console.log(`✓ ${label}`)
}

function sampleReel(overrides: Partial<ViralReelRef> = {}): ViralReelRef {
  const base = reelRefFromResearchHit({
    title: 'Why you\'re not losing belly fat — viral fitness Reel',
    url: 'https://example.com/reel/1',
    description: 'Question hook about fat loss mistakes. 1.2M views discussed publicly.',
    domain: 'example.com',
    retrieved_at: new Date().toISOString(),
    geography: 'INDIA',
    niche: 'FAT_LOSS',
    observation_window: '7 days',
    multi_source: true,
  })
  return { ...base, ...overrides }
}

// --- metrics honesty ---
{
  assert.equal(parseMetric(null), 'UNAVAILABLE')
  assert.equal(parseMetric('n/a'), 'UNAVAILABLE')
  assert.equal(parseMetric('1.2M'), 1_200_000)
  assert.notEqual(parseMetric(undefined), 0)
  ok('unavailable metrics not coerced to 0')
}

// --- virality basis ---
{
  const noFollowers = classifyVirality({
    views: 500_000,
    likes: 'UNAVAILABLE',
    comments: 'UNAVAILABLE',
    follower_count: 'UNAVAILABLE',
    mentioned_as_viral: true,
  })
  assert.ok(noFollowers.bases.includes('ABSOLUTE_REACH') || noFollowers.bases.includes('MULTI_SOURCE_TREND'))
  assert.ok(noFollowers.bases.includes('INSUFFICIENT_DENOMINATOR') || noFollowers.limitations.some((l) => /CREATOR_RELATIVE/i.test(l)))
  assert.ok(noFollowers.limitations.some((l) => /UNAVAILABLE/i.test(l)))
  ok('virality criteria + insufficient denominator')
}

// --- reel analysis honesty ---
{
  const a = analyzeReelFromText('Why you\'re not losing fat? Common beginner mistakes.')
  assert.ok(a.opening_structure)
  assert.ok(a.unsupported_claims.some((c) => /UNSUPPORTED/i.test(c)))
  assert.equal(a.pacing, null)
  ok('viral reel analysis — no invented editing FPS')
}

// --- discovery parse + provenance ---
{
  const reel = sampleReel()
  assert.equal(reel.discovery_method, 'WEB_RESEARCH')
  assert.ok(reel.limitations.some((l) => /WEB_RESEARCH/i.test(l)))
  assert.ok(reel.source_url)
  assert.equal(externalInstagramGraphCapability().status, 'UNSUPPORTED')
  ok('source provenance + Graph UNSUPPORTED')
}

// --- patterns / windows / india ---
{
  const reels = [
    sampleReel({ fingerprint: 'a', hook: 'Why are you stuck?', title: 'Q1' }),
    sampleReel({
      fingerprint: 'b',
      source_url: 'https://example.com/2',
      hook: 'Stop doing this gym mistake',
      title: '3 foods that burn fat',
    }),
    sampleReel({
      fingerprint: 'c',
      source_url: 'https://example.com/3',
      hook: 'What is the best protein?',
      title: '3 foods that help recovery',
    }),
    sampleReel({
      fingerprint: 'd',
      source_url: 'https://example.com/4',
      hook: 'Why beginners fail',
      title: '3 foods that… again',
    }),
  ]
  const hooks = extractHookPatterns(reels, '7 days', 'INDIA')
  assert.ok(hooks.some((h) => h.kind === 'OBSERVED_PATTERN'))
  assert.ok(hooks.every((h) => !containsCausalClaim(h.statement)))
  const topics = extractTopicPatterns(reels, '7 days', 'INDIA')
  assert.ok(topics.length)
  const reps = extractRepetitionSignals(reels, reels.length)
  assert.ok(reps.some((r) => r.kind === 'HOOK_SATURATION_SIGNAL' || r.kind === 'FORMAT_REPETITION_SIGNAL'))
  assert.equal(windowHoursFromLabel('last 7 days'), 168)
  assert.equal(windowLabel(24), '24 hours')
  assert.equal(inferGeography('Indian fat loss Reels Mumbai'), 'INDIA')
  assert.equal(geographySignalLabel('INDIA'), 'INDIA_SIGNAL')
  assert.equal(inferNiche('beginner protein tips'), 'NUTRITION')
  ok('patterns / windows / India vs global labeling')
}

// --- content gaps ---
{
  const gaps = detectContentGaps({
    externalTopics: [
      { topic: 'BEGINNER_FITNESS', count: 12 },
      { topic: 'FAT_LOSS', count: 8 },
    ],
    ownRecentTopics: ['FAT_LOSS', 'transformation tip'],
    ownWindowDays: 60,
  })
  assert.ok(gaps.some((g) => g.topic === 'BEGINNER_FITNESS'))
  assert.ok(gaps.every((g) => g.kind === 'CONTENT_GAP_SIGNAL'))
  assert.ok(gaps.every((g) => /not claim/i.test(g.statement)))
  ok('content gap detection')
}

// --- originality ---
{
  const o = originalityFromTrend({
    trend: 'Why you\'re not losing belly fat',
    observed: 'question hooks common',
    geography: 'INDIA',
  })
  assert.ok(o.angles.some((a) => /Indian/i.test(a)))
  assert.ok(/never copy/i.test(o.note))
  assert.equal(forbidCopyLanguage('copy their script verbatim'), true)
  ok('originality engine')
}

// --- taste / footage / business matching ---
{
  const taste = matchTrendToTaste({
    trend_editing_style: 'fast-cut aggressive zooms',
    taste_notes: ['restrained zooms', 'minimal captions'],
  })
  assert.match(taste.adapted, /restrained/i)

  const footageOk = matchTrendToFootage({
    trend_topic: 'FAT_LOSS',
    available_segments: ['talking head fat loss', 'gym squat'],
  })
  assert.equal(footageOk.status, 'ok')
  const footageMissing = matchTrendToFootage({
    trend_topic: 'SUPPLEMENTS',
    available_segments: ['unrelated beach walk'],
  })
  assert.equal(footageMissing.status, 'NEW_RECORDING_REQUIRED')

  const biz = matchTrendToBusiness({
    trend_topic: 'beginner gym mistakes',
    business_objective: 'lead generation ₹99 funnel',
  })
  assert.match(biz.content_angle, /CTA|coaching/i)
  ok('trend → taste / footage / business')
}

// --- opportunities + no virality guarantees ---
{
  const opps = generateOpportunities({
    reels: [sampleReel()],
    business_objective: 'LURVOX awareness',
    taste_notes: ['minimal captions'],
    audience_signal: ['AUDIENCE_SIGNAL: educational Reels higher saves'],
    footage_available: ['nutrition talking head'],
    geography: 'INDIA',
    niche: 'FAT_LOSS',
  })
  assert.ok(opps.length >= 1)
  assert.ok(['HIGH_FIT', 'MEDIUM_FIT', 'LOW_FIT'].includes(opps[0].fit_level))
  assert.ok(opps[0].scoring.BUSINESS_ALIGNMENT != null)
  const blob = JSON.stringify(opps)
  assert.equal(VIRALITY_GUARANTEE_FORBIDDEN.test(blob), false)
  assert.ok(opps[0].claim_separation.OBSERVED.length)
  assert.ok(opps[0].claim_separation.RECOMMENDATION.some((r) => /not a virality/i.test(r)))
  ok('opportunity generation + claim separation + no virality guarantees')
}

// --- tools ---
async function checkTools() {
  ensureJarvisToolsRegistered()
  for (const name of [
    'instagram.find_viral_reels',
    'instagram.analyze_creator',
    'instagram.compare_creators',
    'instagram.research_niche_trends',
    'instagram.get_trend_report',
    'instagram.find_content_gaps',
    'instagram.generate_opportunities',
    'instagram.search_content_intelligence',
    'instagram.watchlist',
    'instagram.refresh_intelligence',
    'instagram.handoff_opportunity',
  ]) {
    const t = getTool(name)
    assert.ok(t, name)
    assert.doesNotMatch(t!.description, /\b(will publish|auto publishes)\b/i)
  }
  const read = await evaluateToolPermission({
    toolName: 'instagram.get_trend_report',
    source: 'chat',
  })
  assert.equal(read.allowed, true)
  ok('tools registered; no auto-publish; permissions ok')
}

checkTools()
  .then(async () => {
    // Bounded live Brave check if configured (optional)
    if (isBraveSearchConfigured()) {
      console.log('✓ Brave configured — live research can run via verify:brave-search / tools')
    } else {
      console.log('✓ Brave NOT_CONFIGURED — offline niche engine still valid')
    }
    console.log('\nAll Phase 8 Instagram content engine verification checks passed.')
    console.log(
      JSON.stringify({
        external_instagram_graph: 'UNSUPPORTED',
        discovery_default: 'WEB_RESEARCH',
        auto_publish: false,
        virality_guarantees: false,
      })
    )
  })
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
