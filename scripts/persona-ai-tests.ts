/**
 * Persona-based AI output quality tests for the 4-action coaching workflow.
 * Run: npx tsx --env-file=.env.local scripts/persona-ai-tests.ts
 */
import { writeFile, mkdir } from 'node:fs/promises'
import path from 'node:path'
import { generatedDietFormData, generatedWorkoutFormData } from '../src/lib/ai/plan-format'
import { generatePlan } from '../src/lib/ai/generate-plan'
import type { CoachAiActionId } from '../src/lib/coach/ai-actions'
import type { Checkin, OnboardingProfile, Plan } from '../src/types/database'

type PersonaCase = {
  id: string
  label: string
  actionId: CoachAiActionId
  profile: OnboardingProfile
  checkin?: Checkin | null
  activePlan?: Plan | null
  coachNote?: string | null
}

type QualityCheck = {
  id: string
  pass: boolean
  detail: string
}

const now = new Date().toISOString()

function baseProfile(overrides: Partial<OnboardingProfile>): OnboardingProfile {
  return {
    id: `persona-${overrides.name ?? 'client'}`,
    email: `${overrides.name ?? 'client'}@persona.test`,
    name: overrides.name ?? 'Client',
    role: 'client',
    coach_id: 'coach-persona',
    age: overrides.age ?? 28,
    gender: overrides.gender ?? 'female',
    height: overrides.height ?? 162,
    weight: overrides.weight ?? 68,
    fitness_goal: overrides.fitness_goal ?? 'fat_loss',
    activity_level: overrides.activity_level ?? 'moderate',
    training_experience: overrides.training_experience ?? 'beginner',
    diet_preference: overrides.diet_preference ?? 'vegetarian',
    sleep_duration: overrides.sleep_duration ?? '7_8',
    injuries: overrides.injuries ?? null,
    medical_notes: overrides.medical_notes ?? null,
    onboarding_data: overrides.onboarding_data ?? {
      version: 1,
      resumeStep: 10,
      goals: { targetWeight: '62', deadline: '3 months', biggestStruggle: 'late-night snacking' },
      lifestyle: {
        occupation: 'software engineer',
        dailySteps: '6000',
        stressLevel: 'moderate',
        waterIntake: '2L',
      },
      training: {
        location: 'gym',
        daysPerWeek: '4',
        durationMinutes: '60',
        preferredTime: 'evening',
        equipmentAvailable: ['dumbbells', 'barbell', 'cables', 'smith machine'],
      },
      diet: {
        eggDaysPerWeek: '0',
        chickenDaysPerWeek: '0',
        fishDaysPerWeek: '2',
        wheyProtein: 'yes',
        allergies: 'none',
        foodsDisliked: 'mushrooms',
        favoriteFoods: 'dal, paneer, idli, curd rice',
        monthlyFoodBudget: '8000',
        cookingAbility: 'basic',
      },
      eatingPattern: {
        breakfast: '8:30 am — poha or idli',
        lunch: '1:30 pm — rice, dal, sabzi',
        dinner: '9:00 pm — roti, paneer, salad',
        snacks: '6:30 pm — tea with roasted chana',
      },
    },
    onboarding_complete: true,
    plan_delivered: false,
    created_at: now,
    updated_at: now,
  }
}

const PERSONAS: PersonaCase[] = [
  {
    id: 'priya-initial-diet',
    label: 'Priya — initial diet (vegetarian fat loss)',
    actionId: 'initial_diet',
    profile: baseProfile({
      name: 'Priya Sharma',
      age: 29,
      gender: 'female',
      weight: 72,
      fitness_goal: 'fat_loss',
      diet_preference: 'vegetarian',
      training_experience: 'beginner',
    }),
  },
  {
    id: 'rahul-initial-workout',
    label: 'Rahul — initial workout (muscle gain)',
    actionId: 'initial_workout',
    profile: baseProfile({
      name: 'Rahul Mehta',
      age: 26,
      gender: 'male',
      weight: 74,
      height: 178,
      fitness_goal: 'muscle_gain',
      diet_preference: 'non_vegetarian',
      training_experience: 'intermediate',
      injuries: 'mild lower back tightness — avoid heavy deadlifts from floor',
      onboarding_data: {
        version: 1,
        resumeStep: 10,
        training: {
          location: 'gym',
          daysPerWeek: '5',
          durationMinutes: '75',
          preferredTime: 'morning',
          equipmentAvailable: ['barbell', 'dumbbells', 'cables', 'leg press'],
        },
        eatingPattern: {
          breakfast: '8:00 am — eggs and toast',
          lunch: '1:00 pm — chicken rice bowl',
          dinner: '8:30 pm — fish and vegetables',
        },
      },
    }),
  },
  {
    id: 'priya-weekly-diet',
    label: 'Priya — weekly diet update',
    actionId: 'review_update_diet',
    profile: baseProfile({
      name: 'Priya Sharma',
      age: 29,
      gender: 'female',
      weight: 70.5,
      fitness_goal: 'fat_loss',
      diet_preference: 'vegetarian',
    }),
    checkin: {
      id: 'checkin-priya-1',
      client_id: 'persona-Priya Sharma',
      coach_id: 'coach-persona',
      submitted_at: now,
      weight: 70.5,
      waist: 74,
      energy_level: 6,
      hunger_level: 8,
      training_performance: 7,
      adherence_score: 6,
      notes: 'Struggled on weekend. Hunger high Thu-Sun. Skipped whey twice.',
      created_at: now,
    },
    activePlan: {
      id: 'plan-priya-1',
      client_id: 'persona-Priya Sharma',
      coach_id: 'coach-persona',
      title: 'Priya Phase 1',
      phase: 'Foundation',
      workout_plan: 'Upper/Lower 4-day split',
      nutrition_plan: 'Day 1 sample: Breakfast idli + sambar. Lunch dal rice. Dinner paneer roti.',
      cardio_plan: '3x 30 min walks',
      supplement_plan: 'Whey post workout',
      coach_notes: 'Focus protein at breakfast',
      version: 1,
      active: true,
      delivered_at: now,
      created_at: now,
      updated_at: now,
    },
    coachNote: 'Keep calories similar but improve weekend adherence.',
  },
  {
    id: 'rahul-weekly-workout',
    label: 'Rahul — weekly workout update',
    actionId: 'review_update_workout',
    profile: baseProfile({
      name: 'Rahul Mehta',
      age: 26,
      gender: 'male',
      fitness_goal: 'muscle_gain',
      training_experience: 'intermediate',
    }),
    checkin: {
      id: 'checkin-rahul-1',
      client_id: 'persona-Rahul Mehta',
      coach_id: 'coach-persona',
      submitted_at: now,
      weight: 75.2,
      waist: 82,
      energy_level: 8,
      hunger_level: 5,
      training_performance: 9,
      adherence_score: 9,
      notes: 'Hit all sessions. Bench and squat felt strong. Ready for more leg volume.',
      created_at: now,
    },
    activePlan: {
      id: 'plan-rahul-1',
      client_id: 'persona-Rahul Mehta',
      coach_id: 'coach-persona',
      title: 'Rahul Push Pull Legs',
      phase: 'Hypertrophy',
      workout_plan: 'Day 1 Push: bench 4x8, incline DB 3x10. Day 2 Pull: rows 4x8. Day 3 Legs: squat 4x6.',
      nutrition_plan: '3200 kcal high protein',
      cardio_plan: '2x LISS',
      supplement_plan: 'Creatine',
      coach_notes: 'Progressive overload on compounds',
      version: 1,
      active: true,
      delivered_at: now,
      created_at: now,
      updated_at: now,
    },
  },
]

function extractRenderedText(
  actionId: CoachAiActionId,
  generated: Awaited<ReturnType<typeof generatePlan>>['generatedPlan'],
  clientId: string
): string {
  if (actionId === 'initial_diet' || actionId === 'review_update_diet') {
    const form = generatedDietFormData(generated, clientId)
    return [form.nutrition_plan, form.coach_notes].filter(Boolean).join('\n\n').trim()
  }
  const form = generatedWorkoutFormData(generated, clientId)
  return [form.workout_plan, form.cardio_plan, form.coach_notes].filter(Boolean).join('\n\n').trim()
}

function evaluateOutput(persona: PersonaCase, text: string): QualityCheck[] {
  const name = persona.profile.name ?? 'Client'
  const checks: QualityCheck[] = []

  const includesName = new RegExp(name.split(' ')[0]!, 'i').test(text)
  checks.push({
    id: 'uses_client_name',
    pass: includesName,
    detail: includesName ? `Mentions ${name.split(' ')[0]}` : `Expected first name from ${name}`,
  })

  if (persona.actionId === 'initial_diet' || persona.actionId === 'review_update_diet') {
    const dayCount = (text.match(/\b(day|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/gi) ?? [])
      .length
    checks.push({
      id: 'covers_multiple_days',
      pass: dayCount >= 4,
      detail: `Found ${dayCount} day references (need >= 4)`,
    })
    checks.push({
      id: 'has_meal_language',
      pass: /breakfast|lunch|dinner|snack|meal/i.test(text),
      detail: 'Looks for meal-time language',
    })
    checks.push({
      id: 'macro_or_portion_cues',
      pass: /P:\s*\d+g|kcal|katori|roti|dal|paneer/i.test(text),
      detail: 'Looks for macro lines or Indian portion cues',
    })
    if (persona.actionId === 'review_update_diet') {
      checks.push({
        id: 'references_checkin',
        pass: /hunger|weekend|adherence|check-?in|struggled/i.test(text),
        detail: 'Weekly diet update should reflect check-in context',
      })
    }
  }

  if (persona.actionId === 'initial_workout' || persona.actionId === 'review_update_workout') {
    checks.push({
      id: 'has_exercise_structure',
      pass: /\d+\s*x\s*\d+|sets?|reps?|squat|bench|press|row|pulldown/i.test(text),
      detail: 'Looks for sets/reps or named exercises',
    })
    checks.push({
      id: 'has_warmup_or_recovery',
      pass:
        persona.actionId === 'review_update_workout'
          ? true
          : /warm[- ]?up|mobility|stretch|recovery|rest day|steps/i.test(text),
      detail:
        persona.actionId === 'review_update_workout'
          ? 'Skipped for weekly workout updates'
          : 'Looks for warmup/recovery guidance',
    })
    if (persona.actionId === 'review_update_workout') {
      checks.push({
        id: 'has_full_workout_plan',
        pass: (text.match(/\d+\s*x\s*\d+/gi) ?? []).length >= 4,
        detail: 'Weekly workout update should list multiple exercises with sets x reps',
      })
    }
    if (persona.profile.injuries) {
      checks.push({
        id: 'respects_injury',
        pass: !/deadlift from floor|max effort deadlift/i.test(text) || /leg press|hack squat|rdl/i.test(text),
        detail: 'Should avoid aggravating stated injury patterns',
      })
    }
  }

  checks.push({
    id: 'minimum_length',
    pass: text.length >= (persona.actionId === 'review_update_workout' ? 600 : 800),
    detail: `Output length ${text.length} chars (need >= ${persona.actionId === 'review_update_workout' ? 600 : 800})`,
  })

  return checks
}

async function main(): Promise<void> {
  const provider = process.env.AI_PLAN_PROVIDER ?? 'claude'
  const hasKey = Boolean(process.env.ANTHROPIC_API_KEY?.trim())
  const outDir = path.join(process.cwd(), 'prompts', 'production', 'persona-runs')
  await mkdir(outDir, { recursive: true })

  console.log('=== Persona AI Output Tests ===')
  console.log(`Provider: ${provider}`)
  console.log(`Anthropic key: ${hasKey ? 'yes' : 'no'}\n`)

  if (provider !== 'mock' && !hasKey) {
    console.error('ANTHROPIC_API_KEY is required for live persona tests.')
    process.exit(1)
  }

  let allPass = true
  const summary: string[] = []

  const filter = process.env.PERSONA_FILTER?.trim()
  const personas = filter ? PERSONAS.filter((p) => p.id === filter) : PERSONAS
  if (filter && personas.length === 0) {
    console.error(`Unknown PERSONA_FILTER: ${filter}`)
    process.exit(1)
  }

  for (const persona of personas) {
    console.log(`--- ${persona.label} (${persona.actionId}) ---`)
    try {
      const validationMode =
        persona.actionId === 'initial_workout' || persona.actionId === 'review_update_workout'
          ? 'workout_focus'
          : 'nutrition_focus'

      const result = await generatePlan({
        profile: persona.profile,
        latestCheckin: persona.checkin ?? null,
        activePlan: persona.activePlan ?? null,
        coachInstructions: persona.coachNote ?? null,
        actionId: persona.actionId,
        validationMode,
      })

      const rendered = extractRenderedText(persona.actionId, result.generatedPlan, persona.profile.id)
      const checks = evaluateOutput(persona, rendered)
      const failed = checks.filter((c) => !c.pass)

      await writeFile(path.join(outDir, `${persona.id}.txt`), rendered, 'utf8')
      await writeFile(
        path.join(outDir, `${persona.id}.meta.json`),
        JSON.stringify(
          {
            persona: persona.label,
            actionId: persona.actionId,
            model: result.model,
            promptVersion: result.promptVersion,
            inputTokens: result.inputTokens,
            outputTokens: result.outputTokens,
            checks,
          },
          null,
          2
        ),
        'utf8'
      )

      for (const check of checks) {
        console.log(`  ${check.pass ? 'PASS' : 'FAIL'} ${check.id} — ${check.detail}`)
      }

      const pass = failed.length === 0
      if (!pass) allPass = false
      summary.push(`${persona.id}: ${pass ? 'PASS' : 'FAIL'} (${failed.length} failed checks)`)
      console.log(`Result: ${pass ? 'PASS' : 'FAIL'}\n`)
    } catch (err) {
      allPass = false
      const message = err instanceof Error ? err.message : String(err)
      summary.push(`${persona.id}: FAIL (${message})`)
      console.error(`  ERROR: ${message}\n`)
    }
  }

  console.log('=== Summary ===')
  for (const line of summary) console.log(line)
  console.log(`\nArtifacts: ${outDir}`)
  console.log(`Overall: ${allPass ? 'PASS' : 'FAIL'}`)

  process.exit(allPass ? 0 : 1)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
