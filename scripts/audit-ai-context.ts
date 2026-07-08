/**
 * Production AI context audit — prints exact sections sent to Claude per action.
 * Run: npx tsx --env-file=.env.local scripts/audit-ai-context.ts
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { calculateComplexityScore } from '../src/lib/ai/complexity-score'
import { getAllKnowledge } from '../src/lib/ai/knowledge'
import { loadPublishedPromptsForAction } from '../src/lib/ai/prompt-library-loader'
import {
  analyzeInjectedContext,
  buildPrompt,
  buildPromptContextSections,
  formatContextSectionLabel,
  type PromptContextSectionKey,
} from '../src/lib/ai/prompt-builder'
import { profileToComplexityInput } from '../src/lib/ai/generate-plan'
import type { CoachAiActionId } from '../src/lib/coach/ai-actions'
import type { Checkin, OnboardingProfile, Plan } from '../src/types/database'

const ACTION_IDS: CoachAiActionId[] = [
  'initial_diet',
  'initial_workout',
  'review_update_diet',
  'review_update_workout',
]

const REQUIRED_BY_ACTION: Record<CoachAiActionId, PromptContextSectionKey[]> = {
  initial_diet: [
    'clientDetails',
    'onboarding',
    'hardConstraints',
    'knowledge',
    'complexity',
  ],
  initial_workout: [
    'clientDetails',
    'onboarding',
    'hardConstraints',
    'trainingPreferences',
    'knowledge',
    'complexity',
  ],
  review_update_diet: [
    'activeDiet',
    'activeWorkout',
    'checkin',
    'coachNotes',
    'knowledge',
    'clientDetails',
    'onboarding',
  ],
  review_update_workout: [
    'activeWorkout',
    'activeDiet',
    'updatedDiet',
    'checkin',
    'coachNotes',
    'knowledge',
    'trainingPreferences',
  ],
}

const fixtureProfile: OnboardingProfile = {
  id: 'audit-client',
  email: 'audit@example.com',
  name: 'Audit Client',
  role: 'client',
  coach_id: 'coach-audit',
  age: 29,
  gender: 'male',
  height: 178,
  weight: 82,
  fitness_goal: 'fat_loss',
  activity_level: 'moderate',
  training_experience: 'intermediate',
  diet_preference: 'vegetarian',
  sleep_duration: '7_8',
  injuries: 'Mild knee discomfort on deep squats',
  medical_notes: null,
  onboarding_data: {
    version: 1,
    resumeStep: 22,
    goals: { targetWeight: '75', deadline: '3_months', biggestStruggle: 'late_night_snacking' },
    lifestyle: { occupation: 'desk_job', dailySteps: '6000', stressLevel: 'moderate', waterIntake: '2_3l' },
    training: {
      location: 'gym',
      daysPerWeek: '4',
      durationMinutes: '60',
      preferredTime: 'evening',
      equipmentAvailable: ['barbell', 'dumbbells', 'cables'],
      favoriteExercises: 'Lat pulldowns, leg press',
      exercisesDisliked: 'Burpees',
    },
    diet: {
      allergies: 'None',
      foodsDisliked: 'Mushrooms',
      favoriteFoods: 'Paneer, dal, roti',
      monthlyFoodBudget: '8000_12000',
      cookingAbility: 'intermediate',
    },
    eatingPattern: {
      breakfast: 'Poha or oats',
      lunch: 'Dal, roti, sabzi',
      dinner: 'Paneer bowl with rice',
      snacks: 'Fruit or nuts',
      timings: { breakfast: '08:00', lunch: '13:00', dinner: '20:00', snacks: '17:00' },
    },
    supplements: { current: 'Whey protein' },
  },
  onboarding_complete: true,
  plan_delivered: true,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
}

const fixtureCheckin: Checkin = {
  id: 'checkin-audit',
  client_id: fixtureProfile.id,
  coach_id: 'coach-audit',
  submitted_at: new Date().toISOString(),
  weight: 81.2,
  waist: 88,
  energy_level: 6,
  hunger_level: 8,
  training_performance: 7,
  adherence_score: 6,
  notes: 'Struggled with weekend meals; gym sessions felt strong Mon-Wed.',
  created_at: new Date().toISOString(),
}

const fixtureActivePlan: Plan = {
  id: 'plan-audit',
  client_id: fixtureProfile.id,
  coach_id: 'coach-audit',
  title: 'Phase 2 — Fat Loss',
  phase: 'Phase 2',
  workout_plan: 'Day 1 Upper Hypertrophy: Bench 4x8, Rows 4x10...\nDay 2 Lower: Squat 4x6...',
  nutrition_plan: 'Daily ~1900 kcal | P: 130g | C: 190g | F: 55g\nMon breakfast: Oats...',
  cardio_plan: '3x 25 min incline walk post-workout',
  supplement_plan: 'Creatine 5g daily, Vitamin D 2000 IU',
  coach_notes: 'Keep protein high on training days.',
  version: 3,
  active: true,
  delivered_at: new Date().toISOString(),
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
}

const fixtureUpdatedDiet: Plan = {
  ...fixtureActivePlan,
  nutrition_plan: 'Daily ~1850 kcal | P: 135g | C: 175g | F: 54g\nUpdated week — added evening protein snack...',
  cardio_plan: '4x 20 min incline walk',
  coach_notes: 'Added protein snack for hunger; weekend meals simplified.',
}

function loadProductionPromptFallback(category: string): string | null {
  const map: Record<string, string> = {
    initial_diet: 'initial-diet.prompt',
    initial_workout: 'initial-workout.prompt',
    weekly_diet_update: 'updated-diet.prompt',
    weekly_workout_update: 'updated-workout.prompt',
    system_prompt: 'system-prompt.prompt',
  }
  const file = map[category]
  if (!file) return null
  try {
    return readFileSync(join(process.cwd(), 'prompts', 'production', file), 'utf8')
  } catch {
    return null
  }
}

function printSectionExcerpt(label: string, text: string, maxLines = 6): void {
  const lines = text.trim().split('\n').slice(0, maxLines)
  console.log(`  [${label}]`)
  for (const line of lines) {
    console.log(`    ${line}`)
  }
  if (text.trim().split('\n').length > maxLines) {
    console.log('    …')
  }
}

let failures = 0

async function auditAction(actionId: CoachAiActionId): Promise<void> {
  console.log(`\n${'='.repeat(72)}`)
  console.log(`ACTION: ${actionId}`)
  console.log('='.repeat(72))

  const profile = fixtureProfile
  const checkin = actionId.startsWith('review_') ? fixtureCheckin : null
  const activePlan = actionId.startsWith('review_') || actionId === 'initial_workout' ? fixtureActivePlan : null
  const updatedDietPlan = actionId === 'review_update_workout' ? fixtureUpdatedDiet : null
  const coachInstructions =
    actionId.startsWith('review_') ? 'Prioritize adherence fixes from check-in.' : null

  const loaded = await loadPublishedPromptsForAction(actionId, profile)
  const actionTemplate =
    loaded?.action.promptBody.trim() ||
    loadProductionPromptFallback(loaded?.resolvedCategory ?? actionId) ||
    ''
  const systemTemplate =
    loaded?.system?.promptBody.trim() ||
    loadProductionPromptFallback('system_prompt') ||
    null

  if (!actionTemplate) {
    failures++
    console.error('FAIL: No action template (DB or production file)')
    return
  }

  const complexityScore = calculateComplexityScore(profileToComplexityInput(profile, checkin))
  const { data: knowledgeEntries } = await getAllKnowledge()

  const built = buildPrompt({
    profile,
    latestCheckin: checkin,
    complexityScore,
    knowledgeEntries: knowledgeEntries ?? [],
    coachInstructions,
    activePlan,
    updatedDietPlan,
    actionId,
    actionTemplate,
    systemTemplate,
  })

  const sections = buildPromptContextSections({
    profile,
    latestCheckin: checkin,
    complexityScore,
    knowledgeEntries: knowledgeEntries ?? [],
    coachInstructions,
    activePlan,
    updatedDietPlan,
    actionId,
  })

  const analysis = analyzeInjectedContext({
    systemPrompt: built.systemPrompt,
    userPrompt: built.userPrompt,
    sections,
    actionId,
  })

  console.log(`Prompt version: ${loaded ? `${loaded.action.slug}@v${loaded.action.version}` : 'production file'}`)
  if (loaded && loaded.action.category !== loaded.resolvedCategory) {
    failures++
    console.error(
      `FAIL: loaded prompt category ${loaded.action.category} does not match resolved ${loaded.resolvedCategory}`
    )
  }

  console.log('\nContext sections in SYSTEM prompt:')
  if (analysis.inSystem.length === 0) console.log('  (none)')
  for (const key of analysis.inSystem) {
    printSectionExcerpt(formatContextSectionLabel(key), sections[key])
  }

  console.log('\nContext sections in USER prompt (injected or appended):')
  const userKeys = [...new Set([...analysis.inUser, ...analysis.appendedToUser])]
  if (userKeys.length === 0) console.log('  (none)')
  for (const key of userKeys) {
    printSectionExcerpt(formatContextSectionLabel(key), sections[key])
  }

  if (analysis.duplicated.length > 0) {
    failures++
    console.error(
      `\nFAIL: Duplicated sections across system+user: ${analysis.duplicated.map(formatContextSectionLabel).join(', ')}`
    )
  } else {
    console.log('\nPASS: No duplicated context sections')
  }

  const required = REQUIRED_BY_ACTION[actionId]
  const missing = required.filter((key) => {
    const corpus = `${built.systemPrompt}\n${built.userPrompt}`
    const marker = sections[key].trim().slice(0, 48)
    return marker.length > 0 && !corpus.includes(marker)
  })

  if (missing.length > 0) {
    failures++
    console.error(`FAIL: Missing required sections: ${missing.map(formatContextSectionLabel).join(', ')}`)
  } else {
    console.log(`PASS: All required sections present (${required.map(formatContextSectionLabel).join(', ')})`)
  }

  if (analysis.missingSubstantive.length > 0) {
    console.warn(
      `WARN: Append-order sections not injected: ${analysis.missingSubstantive.map(formatContextSectionLabel).join(', ')}`
    )
  }

  console.log(`\nToken estimate: ~${built.estimatedTokens} | System: ${built.systemPrompt.length} chars | User: ${built.userPrompt.length} chars`)
}

async function main(): Promise<void> {
  console.log('Production AI Context Audit')
  console.log(`Date: ${new Date().toISOString()}`)

  for (const actionId of ACTION_IDS) {
    await auditAction(actionId)
  }

  console.log(`\n${'='.repeat(72)}`)
  if (failures > 0) {
    console.error(`AUDIT FAILED — ${failures} action(s) with issues`)
    process.exit(1)
  }
  console.log('AUDIT PASSED — all actions have required context')
}

void main()
