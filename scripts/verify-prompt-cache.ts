/**
 * Verifies dependency-based prompt cache behaviour.
 * Run: npx tsx scripts/verify-prompt-cache.ts
 */
import { calculateComplexityScore } from '../src/lib/ai/complexity-score'
import { buildPrompt } from '../src/lib/ai/prompt-builder'
import { profileToComplexityInput } from '../src/lib/ai/generate-plan'
import {
  compileCachedPrompt,
  getPromptCacheAnalytics,
  invalidateForEvent,
  invalidateKnowledgeBase,
  invalidatePromptLibrary,
  resetPromptCacheAnalytics,
} from '../src/lib/ai/prompt-cache'
import { resetPromptCacheStore } from '../src/lib/ai/prompt-cache/memory-store'
import type { Checkin, OnboardingProfile, Plan } from '../src/types/database'

const results: Record<string, 'PASS' | 'FAIL'> = {}

function fail(key: string, detail: string): void {
  results[key] = 'FAIL'
  console.error(`FAIL ${key}: ${detail}`)
}

function pass(key: string, detail?: string): void {
  results[key] = 'PASS'
  console.log(`PASS ${key}${detail ? `: ${detail}` : ''}`)
}

const profile: OnboardingProfile = {
  id: 'cache-test-user',
  email: 'cache@test.com',
  name: 'Cache Test',
  role: 'client',
  coach_id: 'coach-1',
  age: 30,
  gender: 'male',
  height: 175,
  weight: 80,
  fitness_goal: 'muscle_gain',
  activity_level: 'active',
  training_experience: 'intermediate',
  diet_preference: 'non_vegetarian',
  sleep_duration: '7_8',
  injuries: null,
  medical_notes: null,
  onboarding_data: {
    version: 1,
    resumeStep: 20,
    training: { daysPerWeek: '4', location: 'gym', equipmentAvailable: ['barbell'] },
    diet: { allergies: 'none' },
  },
  onboarding_complete: true,
  plan_delivered: true,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
}

const checkin: Checkin = {
  id: 'ci-1',
  client_id: profile.id,
  coach_id: 'coach-1',
  submitted_at: '2026-07-01T10:00:00.000Z',
  weight: 79.5,
  waist: 82,
  energy_level: 8,
  hunger_level: 4,
  training_performance: 7,
  adherence_score: 9,
  notes: 'Strong week',
  created_at: '2026-07-01T10:00:00.000Z',
}

const activePlan: Plan = {
  id: 'plan-1',
  client_id: profile.id,
  coach_id: 'coach-1',
  title: 'Phase 1',
  phase: 'Hypertrophy',
  workout_plan: 'Day 1: Chest\nDay 2: Back',
  nutrition_plan: '2500 kcal high protein',
  cardio_plan: '2x LISS',
  supplement_plan: 'Creatine 5g',
  coach_notes: 'Focus on sleep',
  version: 3,
  active: true,
  delivered_at: '2026-06-01T00:00:00.000Z',
  created_at: '2026-06-01T00:00:00.000Z',
  updated_at: '2026-06-15T00:00:00.000Z',
}

const knowledgeEntries = [
  {
    id: 'kb-1',
    title: 'Muscle Gain Basics',
    category: 'muscle_gain' as const,
    content: 'Progressive overload is key.',
    version: 2,
    active: true,
    created_at: '',
    updated_at: '',
  },
  {
    id: 'kb-2',
    title: 'Nutrition',
    category: 'nutrition' as const,
    content: 'Protein 1.6-2.2g/kg.',
    version: 1,
    active: true,
    created_at: '',
    updated_at: '',
  },
]

const libraryTemplate = {
  actionTemplate: `Generate a plan.\n[HARD CONSTRAINTS]\n[CLIENT DETAILS]\n[KNOWLEDGE BASE]`,
  systemTemplate: `System role.\n[COMPLEXITY ASSESSMENT]\n[KNOWLEDGE BASE]`,
}

function baseInput(overrides: Partial<Parameters<typeof compileCachedPrompt>[0]> = {}) {
  const complexityScore = calculateComplexityScore(profileToComplexityInput(profile, checkin))
  return {
    profile,
    latestCheckin: checkin,
    complexityScore,
    knowledgeEntries,
    coachInstructions: 'Push volume slightly',
    activePlan,
    clientId: profile.id,
    actionId: 'review_update_diet' as const,
    actionTemplate: libraryTemplate.actionTemplate,
    systemTemplate: libraryTemplate.systemTemplate,
    promptVersion: 'prompt-library:v12',
    ...overrides,
  }
}

async function testCacheMiss(): Promise<void> {
  resetPromptCacheStore()
  resetPromptCacheAnalytics()
  const { report } = await compileCachedPrompt(baseInput())
  if (report.cacheMisses > 0 && report.cacheHits === 0) {
    pass('cache_miss', `${report.cacheMisses} blocks rebuilt`)
  } else {
    fail('cache_miss', `expected all misses, got hits=${report.cacheHits} misses=${report.cacheMisses}`)
  }
}

async function testCacheHit(): Promise<void> {
  await compileCachedPrompt(baseInput())
  const { report, result } = await compileCachedPrompt(baseInput())
  if (report.cacheHits > 0 && report.cacheMisses === 0) {
    pass('cache_hit', `${report.cacheHits} blocks reused, ratio=${report.hitRatio}%`)
  } else {
    fail('cache_hit', `hits=${report.cacheHits} misses=${report.cacheMisses}`)
  }
  void result
}

async function testIdenticalOutput(): Promise<void> {
  const input = baseInput()
  const { result: cached } = await compileCachedPrompt(input)
  const direct = buildPrompt({
    profile: input.profile,
    latestCheckin: input.latestCheckin,
    complexityScore: input.complexityScore,
    knowledgeEntries: input.knowledgeEntries,
    coachInstructions: input.coachInstructions,
    activePlan: input.activePlan,
    actionId: input.actionId,
    actionTemplate: input.actionTemplate,
    systemTemplate: input.systemTemplate,
  })
  if (cached.systemPrompt === direct.systemPrompt && cached.userPrompt === direct.userPrompt) {
    pass('identical_output', 'cached matches buildPrompt byte-for-byte')
  } else {
    fail('identical_output', 'cached prompt differs from buildPrompt')
  }
}

async function testPartialInvalidation(): Promise<void> {
  resetPromptCacheStore()
  await compileCachedPrompt(baseInput())
  await invalidateForEvent('checkin_submitted', profile.id)
  const { report } = await compileCachedPrompt(baseInput())
  const checkinBlock = report.blocks.find((b) => b.blockId === 'checkins')
  const profileBlock = report.blocks.find((b) => b.blockId === 'client-profile')
  if (checkinBlock && !checkinBlock.hit && profileBlock?.hit) {
    pass('partial_invalidation', 'only checkins block rebuilt')
  } else {
    fail(
      'partial_invalidation',
      `checkins hit=${checkinBlock?.hit} profile hit=${profileBlock?.hit}`
    )
  }
}

async function testKnowledgeInvalidation(): Promise<void> {
  resetPromptCacheStore()
  await compileCachedPrompt(baseInput())
  invalidateKnowledgeBase()
  const { report } = await compileCachedPrompt(baseInput())
  const kb = report.blocks.find((b) => b.blockId === 'knowledge-base')
  if (kb && !kb.hit) {
    pass('knowledge_invalidation')
  } else {
    fail('knowledge_invalidation', `knowledge hit=${kb?.hit}`)
  }
}

async function testPromptLibraryInvalidation(): Promise<void> {
  resetPromptCacheStore()
  await compileCachedPrompt(baseInput())
  invalidatePromptLibrary()
  const { report } = await compileCachedPrompt(baseInput())
  const pl = report.blocks.find((b) => b.blockId === 'prompt-library')
  if (pl && !pl.hit) {
    pass('prompt_library_invalidation')
  } else {
    fail('prompt_library_invalidation', `prompt-library hit=${pl?.hit}`)
  }
}

async function testJourneyInvalidation(): Promise<void> {
  resetPromptCacheStore()
  await compileCachedPrompt(baseInput())
  await invalidateForEvent('journey_updated', profile.id)
  const { result } = await compileCachedPrompt(baseInput())
  if (result.userPrompt.length > 50) {
    pass('journey_invalidation', 'compiled prompt still valid after invalidation')
  } else {
    fail('journey_invalidation', 'empty prompt after journey invalidation')
  }
}

async function testPlanActivation(): Promise<void> {
  resetPromptCacheStore()
  await compileCachedPrompt(baseInput())
  await invalidateForEvent('plan_activated', profile.id)
  const { report } = await compileCachedPrompt(baseInput())
  const diet = report.blocks.find((b) => b.blockId === 'diet')
  const workout = report.blocks.find((b) => b.blockId === 'workout')
  if (diet && !diet.hit && workout && !workout.hit) {
    pass('plan_activation')
  } else {
    fail('plan_activation', `diet hit=${diet?.hit} workout hit=${workout?.hit}`)
  }
}

async function testCheckinSubmission(): Promise<void> {
  resetPromptCacheStore()
  await compileCachedPrompt(baseInput())
  await invalidateForEvent('checkin_submitted', profile.id)
  const { report } = await compileCachedPrompt(baseInput())
  const checkins = report.blocks.find((b) => b.blockId === 'checkins')
  const complexity = report.blocks.find((b) => b.blockId === 'complexity')
  if (checkins && !checkins.hit) {
    pass('checkin_submission', `complexity hit=${complexity?.hit}`)
  } else {
    fail('checkin_submission', `checkins hit=${checkins?.hit}`)
  }
}

async function testCoachNotesInvalidation(): Promise<void> {
  resetPromptCacheStore()
  await compileCachedPrompt(baseInput())
  await invalidateForEvent('coach_notes_changed', profile.id)
  const { report } = await compileCachedPrompt(baseInput({ coachInstructions: 'New coach note' }))
  const notes = report.blocks.find((b) => b.blockId === 'coach-notes')
  if (notes && !notes.hit) {
    pass('coach_notes_invalidation')
  } else {
    fail('coach_notes_invalidation', `coach-notes hit=${notes?.hit}`)
  }
}

async function testConcurrentRequests(): Promise<void> {
  resetPromptCacheStore()
  resetPromptCacheAnalytics()
  const input = baseInput()
  const runs = await Promise.all([
    compileCachedPrompt(input),
    compileCachedPrompt(input),
    compileCachedPrompt(input),
  ])
  const allValid = runs.every((r) => r.result.systemPrompt.length > 100)
  const analytics = getPromptCacheAnalytics()
  if (allValid && analytics.recentCompiles >= 3) {
    pass('concurrent_requests', `${analytics.recentCompiles} compiles, hit ratio ${analytics.hitRatio}%`)
  } else {
    fail('concurrent_requests', 'concurrent compile failed')
  }
}

async function main(): Promise<void> {
  console.log('=== Prompt Cache Verification ===\n')

  await testCacheMiss()
  await testCacheHit()
  await testIdenticalOutput()
  await testPartialInvalidation()
  await testKnowledgeInvalidation()
  await testPromptLibraryInvalidation()
  await testJourneyInvalidation()
  await testPlanActivation()
  await testCheckinSubmission()
  await testCoachNotesInvalidation()
  await testConcurrentRequests()

  const failed = Object.values(results).filter((r) => r === 'FAIL').length
  const passed = Object.values(results).filter((r) => r === 'PASS').length
  console.log(`\n=== ${passed} passed, ${failed} failed ===`)
  process.exit(failed > 0 ? 1 : 0)
}

void main()
