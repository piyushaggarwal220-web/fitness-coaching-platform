/**
 * Verifies Prompt Library → AI generation integration.
 * Run: npx tsx --env-file=.env.local scripts/verify-prompt-library-integration.ts
 */
import { calculateComplexityScore } from '../src/lib/ai/complexity-score'
import { generatePlan } from '../src/lib/ai/generate-plan'
import { getAllKnowledge } from '../src/lib/ai/knowledge'
import {
  COACH_ACTION_PROMPT_CATEGORY,
  loadPublishedPromptsForAction,
} from '../src/lib/ai/prompt-library-loader'
import { buildPrompt } from '../src/lib/ai/prompt-builder'
import { profileToComplexityInput } from '../src/lib/ai/generate-plan'
import type { CoachAiActionId } from '../src/lib/coach/ai-actions'
import type { Checkin, OnboardingProfile, Plan, PromptLibraryCategory } from '../src/types/database'

process.env.AI_PLAN_PROVIDER = 'mock'

const ACTION_IDS: CoachAiActionId[] = [
  'initial_diet',
  'initial_workout',
  'review_update_diet',
  'review_update_workout',
  'review_analyze_checkin',
  'review_coach_message',
]

const CATEGORY_LABELS: Record<PromptLibraryCategory, string> = {
  system_prompt: 'System Prompt',
  initial_diet: 'Initial Diet',
  initial_workout: 'Initial Workout',
  weekly_diet_update: 'Weekly Diet Update',
  weekly_workout_update: 'Weekly Workout Update',
  mid_week_analysis: 'Mid-week Analysis',
  coach_message: 'Coach Message',
  future_prompts: 'Future Prompts',
}

const results: Record<string, 'PASS' | 'FAIL'> = {}

function fail(key: string, detail: string): void {
  results[key] = 'FAIL'
  console.error(`FAIL ${key}: ${detail}`)
}

function pass(key: string, detail?: string): void {
  results[key] = 'PASS'
  console.log(`PASS ${key}${detail ? `: ${detail}` : ''}`)
}

const sampleProfile: OnboardingProfile = {
  id: 'verify-client',
  email: 'verify@example.com',
  name: 'Verify Client',
  role: 'client',
  coach_id: 'coach-1',
  age: 32,
  gender: 'female',
  height: 165,
  weight: 68,
  fitness_goal: 'fat_loss',
  activity_level: 'moderate',
  training_experience: 'intermediate',
  diet_preference: 'balanced',
  sleep_duration: '7_8',
  injuries: null,
  medical_notes: null,
  onboarding_data: {
    version: 1,
    resumeStep: 10,
    diet: { cookingAbility: 'intermediate' },
    training: { daysPerWeek: '3', equipmentAvailable: ['dumbbells', 'barbell'] },
    eatingPattern: {
      breakfast: 'eggs and toast',
      lunch: 'chicken salad',
      dinner: 'fish and rice',
    },
  },
  onboarding_complete: true,
  plan_delivered: false,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
}

const sampleCheckin: Checkin = {
  id: 'checkin-1',
  client_id: sampleProfile.id,
  coach_id: 'coach-1',
  submitted_at: new Date().toISOString(),
  weight: 67.5,
  waist: 72,
  energy_level: 7,
  hunger_level: 5,
  training_performance: 8,
  adherence_score: 9,
  notes: 'Feeling good this week',
  created_at: new Date().toISOString(),
}

const samplePlan: Plan = {
  id: 'plan-1',
  client_id: sampleProfile.id,
  coach_id: 'coach-1',
  title: 'Phase 1',
  phase: 'Foundation',
  workout_plan: 'Upper/Lower split',
  nutrition_plan: '2000 kcal, high protein',
  cardio_plan: '3x LISS',
  supplement_plan: 'Creatine, Vitamin D',
  coach_notes: 'Focus on adherence',
  version: 1,
  active: true,
  delivered_at: new Date().toISOString(),
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
}

async function verifyPromptLoading(): Promise<void> {
  let allLoaded = true
  for (const actionId of ACTION_IDS) {
    const loaded = await loadPublishedPromptsForAction(actionId)
    const expectedCategory = COACH_ACTION_PROMPT_CATEGORY[actionId]
    const expectedLabel = CATEGORY_LABELS[expectedCategory]
    if (!loaded?.action?.promptBody?.trim()) {
      allLoaded = false
      console.error(
        `  missing published prompt for ${actionId} → ${expectedLabel} (${expectedCategory})`
      )
      continue
    }
    if (loaded.action.category !== expectedCategory) {
      allLoaded = false
      console.error(`  category mismatch for ${actionId}: got ${loaded.action.category}`)
    }
    console.log(
      `  ${actionId} → ${loaded.action.name} (${loaded.action.slug}@v${loaded.action.version})`
    )
  }
  if (allLoaded) pass('Prompt loading')
  else fail('Prompt loading', 'one or more actions missing published prompts')
}

async function verifyClientDataInjection(): Promise<void> {
  const complexityScore = calculateComplexityScore(profileToComplexityInput(sampleProfile, sampleCheckin))
  const { data: knowledgeEntries } = await getAllKnowledge()
  const template = [
    'CLIENT:[CLIENT DETAILS]',
    'ONBOARD:[ONBOARDING ANSWERS]',
    'PLAN:[ACTIVE PLAN]',
    'CHECKIN:[WEEKLY CHECK-IN]',
    'NOTES:[COACH NOTES]',
    'COMPLEX:[COMPLEXITY]',
  ].join('\n')

  const built = buildPrompt({
    profile: sampleProfile,
    latestCheckin: sampleCheckin,
    complexityScore,
    knowledgeEntries: knowledgeEntries ?? [],
    coachInstructions: 'Prioritize protein at breakfast',
    activePlan: samplePlan,
    actionTemplate: template,
  })

  const checks: [string, string][] = [
    ['Verify Client', 'client profile name'],
    ['## Onboarding Answers', 'onboarding section'],
    ['Phase 1', 'active plan title'],
    ['Feeling good this week', 'check-in notes'],
    ['Prioritize protein at breakfast', 'coach notes'],
    ['## Complexity Assessment', 'complexity section'],
  ]

  let ok = true
  for (const [needle, label] of checks) {
    if (!built.userPrompt.includes(needle)) {
      ok = false
      console.error(`  missing ${label}: "${needle}"`)
    }
  }
  if (built.userPrompt.includes('[CLIENT DETAILS]')) {
    ok = false
    console.error('  placeholder [CLIENT DETAILS] was not replaced')
  }

  if (ok) pass('Client data injection')
  else fail('Client data injection', 'placeholder replacement incomplete')
}

async function verifyKnowledgeBaseInjection(): Promise<void> {
  const complexityScore = calculateComplexityScore(profileToComplexityInput(sampleProfile))
  const { data: knowledgeEntries } = await getAllKnowledge()
  const entries = knowledgeEntries ?? []

  const built = buildPrompt({
    profile: sampleProfile,
    complexityScore,
    knowledgeEntries: entries,
    actionTemplate: 'KB:\n[KNOWLEDGE BASE]',
  })

  const hasKbSection = built.userPrompt.includes('## Coaching Knowledge Base')
  const hasUnreplaced = built.userPrompt.includes('[KNOWLEDGE BASE]')

  if (hasKbSection && !hasUnreplaced) {
    pass('Knowledge base injection', `${entries.filter((e) => e.active).length} active entries`)
  } else if (entries.length === 0 && hasKbSection && !hasUnreplaced) {
    pass('Knowledge base injection', 'empty knowledge base handled')
  } else {
    fail('Knowledge base injection', 'knowledge section missing or placeholder unreplaced')
  }
}

async function verifyDietGeneration(): Promise<void> {
  try {
    const result = await generatePlan({
      profile: sampleProfile,
      coachInstructions: 'Test diet generation',
      actionId: 'initial_diet',
    })
    if (result.generatedPlan.nutrition_plan.meals.length > 0 && result.promptVersion.includes('@v')) {
      pass('Diet generation', result.promptVersion)
    } else {
      fail('Diet generation', 'invalid mock diet output or missing library version')
    }
  } catch (err) {
    fail('Diet generation', err instanceof Error ? err.message : String(err))
  }
}

async function verifyWorkoutGeneration(): Promise<void> {
  try {
    const result = await generatePlan({
      profile: sampleProfile,
      coachInstructions: 'Test workout generation',
      actionId: 'initial_workout',
      validationMode: 'workout_focus',
    })
    if (result.generatedPlan.workout_plan.overview.trim() && result.promptVersion.includes('@v')) {
      pass('Workout generation', result.promptVersion)
    } else {
      fail('Workout generation', 'invalid mock workout output or missing library version')
    }
  } catch (err) {
    fail('Workout generation', err instanceof Error ? err.message : String(err))
  }
}

async function verifyWeeklyUpdate(): Promise<void> {
  try {
    const result = await generatePlan({
      profile: sampleProfile,
      latestCheckin: sampleCheckin,
      coachInstructions: 'Adjust calories down slightly',
      actionId: 'review_update_diet',
      activePlan: samplePlan,
    })
    if (result.generatedPlan.nutrition_plan && result.promptVersion.includes('@v')) {
      pass('Weekly update', result.promptVersion)
    } else {
      fail('Weekly update', 'invalid mock weekly update output')
    }
  } catch (err) {
    fail('Weekly update', err instanceof Error ? err.message : String(err))
  }
}

async function main(): Promise<void> {
  console.log('=== Prompt Library Integration Verification ===\n')

  await verifyPromptLoading()
  await verifyClientDataInjection()
  await verifyKnowledgeBaseInjection()
  await verifyDietGeneration()
  await verifyWorkoutGeneration()
  await verifyWeeklyUpdate()

  console.log('\n=== Summary ===')
  for (const key of [
    'Prompt loading',
    'Client data injection',
    'Knowledge base injection',
    'Diet generation',
    'Workout generation',
    'Weekly update',
  ]) {
    console.log(`${key}: ${results[key] ?? 'FAIL'}`)
  }

  const allPass = Object.values(results).every((v) => v === 'PASS')
  process.exit(allPass ? 0 : 1)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
