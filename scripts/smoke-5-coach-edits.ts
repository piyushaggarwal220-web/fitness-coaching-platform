/**
 * Smoke 5 clients through coach cardio + diet edits.
 *
 * Cardio must stay a single step count. Diet changes and client-told
 * preferences the coach applied must still hold after a later coach request.
 *
 * Run:
 *   npx tsx --env-file=.env.local.txt scripts/smoke-5-coach-edits.ts
 *   npx tsx --env-file=.env.local.txt scripts/smoke-5-coach-edits.ts --mock
 *   npx tsx --env-file=.env.local.txt scripts/smoke-5-coach-edits.ts --cleanup
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  createFakeTrialClient,
  listCoachesForAssignment,
} from '../src/lib/admin/testing-accounts'
import { extractStepCount, isStepsOnlyCardioPlan } from '../src/lib/ai/cardio-steps'
import { foodsPresentInDiet } from '../src/lib/ai/coach-edit-followthrough'
import { dietScanOptionsFromProfile, enforceDietPreference } from '../src/lib/ai/diet-preference-guard'
import { editPlanSection } from '../src/lib/ai/edit-plan-section'
import { generatePlan } from '../src/lib/ai/generate-plan'
import { generatedCardioFormData, generatedDietFormData } from '../src/lib/ai/plan-format'
import { coachAcceptsAutoAssignment } from '../src/lib/coach-delivery-policy'
import { createAdminClient } from '../src/lib/supabase/admin'
import type { OnboardingProfile } from '../src/types/database'
import { finalSmokeScenarios, type LifestyleScenario } from './lifestyle-smoke-scenarios'

type Check = { name: string; ok: boolean; detail: string }
type ClientResult = {
  index: number
  scenarioId: string
  clientId: string
  email: string
  name: string
  cardioAfterGenerate: string
  cardioAfterEdit1: string
  cardioAfterEdit2: string
  dietAfterEdit1?: string
  dietAfterEdit2?: string
  checks: Check[]
  passed: number
  failed: number
  error?: string
}

function reportPath(): string {
  const custom = process.argv.find((a) => a.startsWith('--report='))
  if (custom) return join(process.cwd(), custom.slice('--report='.length))
  return join(process.cwd(), 'tmp-smoke-5-coach-edits-report.json')
}

function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`)
}

function argValue(name: string, fallback: string): string {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`))
  return hit ? hit.slice(name.length + 3) : fallback
}

type DietCoachCase = {
  clientToldCoach: string
  laterCoachRequest: string
  mustRemainGone: string[]
  skipBreakfast?: boolean
  skipLunch?: boolean
}

/** Client-told preferences the coach applied, then a later unrelated request. */
const DIET_COACH_CASES: Record<string, DietCoachCase> = {
  'office-canteen-veg': {
    clientToldCoach:
      'Client does not want paneer. Remove paneer everywhere and keep the plan vegetarian.',
    laterCoachRequest: 'Add an evening fruit snack. Keep calories practical for office days.',
    mustRemainGone: ['paneer'],
  },
  'night-shift-nurse': {
    clientToldCoach:
      'Client sleeps through lunch on shift days. Skip lunch. Do not add lunch. Keep mushrooms out.',
    laterCoachRequest: 'Make dinner a bit bigger for night-shift energy.',
    mustRemainGone: ['mushroom'],
    skipLunch: true,
  },
  'hostel-mess-vegan': {
    clientToldCoach: 'Client asked to drop soy and tofu from the mess plan. Keep it vegan.',
    laterCoachRequest: 'Add extra rice at lunch for the muscle-gain target.',
    mustRemainGone: ['soy', 'soya', 'tofu', 'tempeh'],
  },
  'if-skip-breakfast': {
    clientToldCoach:
      'Keep skipping breakfast as the client requested. First meal is lunch. Remove olives everywhere.',
    laterCoachRequest: 'Make lunch a bit bigger. Do not add breakfast.',
    mustRemainGone: ['olive'],
    skipBreakfast: true,
  },
  'jain-no-root': {
    clientToldCoach:
      'Client is Jain — no onion, garlic, potato, aloo, or carrot. Keep those out of every day.',
    laterCoachRequest: 'Add a fruit snack in the evening.',
    mustRemainGone: ['onion', 'garlic', 'potato', 'aloo', 'carrot'],
  },
}

function dietCoachCaseFor(scenario: LifestyleScenario): DietCoachCase {
  return (
    DIET_COACH_CASES[scenario.id] ?? {
      clientToldCoach: 'Honor the client diet preference, allergies, and dislikes exactly.',
      laterCoachRequest: 'Add an evening fruit snack if it stays preference-safe.',
      mustRemainGone: [],
      skipBreakfast: scenario.skipBreakfast,
      skipLunch: scenario.skipLunch,
    }
  )
}

function mealStillServed(diet: string, meal: 'breakfast' | 'lunch'): boolean {
  return diet.split('\n').some((line) => {
    if (!new RegExp(`\\b${meal}\\b`, 'i').test(line)) return false
    return !/skip|fast|none|n\/a|no breakfast|no lunch|sleep/i.test(line)
  })
}

function excludedHits(diet: string, terms: string[]): string[] {
  return terms.filter((term) => {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    if (/^\d/.test(term) || term.includes(':') || term.includes(' ')) {
      return diet.toLowerCase().includes(term.toLowerCase())
    }
    return new RegExp(`\\b${escaped}s?\\b`, 'i').test(diet)
  })
}

async function cleanupFromReport(): Promise<void> {
  const path = reportPath()
  if (!existsSync(path)) {
    console.log('No report file to clean up.')
    return
  }
  const report = JSON.parse(readFileSync(path, 'utf8')) as { clients?: { clientId: string }[] }
  const admin = createAdminClient()
  const ids = (report.clients ?? []).map((c) => c.clientId).filter(Boolean)
  for (const id of ids) {
    await admin.from('plans').delete().eq('client_id', id)
    await admin.from('ai_generation_logs').delete().eq('client_id', id)
    await admin.from('profiles').delete().eq('id', id)
    await admin.auth.admin.deleteUser(id)
    console.log(`Deleted ${id}`)
  }
}

async function main(): Promise<void> {
  if (hasFlag('cleanup')) {
    await cleanupFromReport()
    return
  }

  const useMock = hasFlag('mock')
  if (useMock) process.env.AI_PLAN_PROVIDER = 'mock'
  else process.env.AI_PLAN_PROVIDER = process.env.AI_PLAN_PROVIDER || 'openai'

  const scenarios = finalSmokeScenarios().slice(0, Math.max(1, Number(argValue('count', '5')) || 5))
  const path = reportPath()
  console.log(
    `=== Coach edit smoke: ${scenarios.length} clients, provider=${process.env.AI_PLAN_PROVIDER} ===\n`
  )

  const coaches = await listCoachesForAssignment()
  const planCoachId = coaches.find((c) => coachAcceptsAutoAssignment(c.id))?.id ?? null
  const admin = createAdminClient()
  const created: Array<{ clientId: string; email: string; scenario: LifestyleScenario }> = []

  for (let i = 0; i < scenarios.length; i++) {
    const scenario = scenarios[i]!
    const account = await createFakeTrialClient(null, scenario.form)
    created.push({ clientId: account.userId, email: account.email, scenario })
    console.log(`Created ${i + 1}/${scenarios.length}: ${account.email} [${scenario.id}]`)
  }

  const results: ClientResult[] = []
  for (let index = 0; index < created.length; index++) {
    const c = created[index]!
    const label = `#${index + 1} ${c.scenario.id}`
    console.log(`\nCoach flow for ${label}…`)
    const { data: profile, error } = await admin.from('profiles').select('*').eq('id', c.clientId).single()
    if (error || !profile) {
      results.push({
        index: index + 1,
        scenarioId: c.scenario.id,
        clientId: c.clientId,
        email: c.email,
        name: c.scenario.form.name,
        cardioAfterGenerate: '',
        cardioAfterEdit1: '',
        cardioAfterEdit2: '',
        checks: [],
        passed: 0,
        failed: 1,
        error: error?.message ?? 'profile missing',
      })
      continue
    }
    const onboarding = profile as OnboardingProfile

    try {
      const cardioResult = await generatePlan({
        profile: onboarding,
        actionId: 'initial_cardio',
        validationMode: 'cardio_focus',
        coachInstructions: 'Write only the daily step count.',
      })
      let cardio = generatedCardioFormData(cardioResult.generatedPlan, c.clientId).cardio_plan ?? ''

      const edit1 = await editPlanSection({
        section: 'cardio',
        currentText: cardio,
        coachInstruction: 'Set daily steps to 10000',
        editSource: 'coach',
        clientName: onboarding.name,
        clientId: c.clientId,
        profile: onboarding,
      })
      cardio = edit1.revisedText

      const edit2 = await editPlanSection({
        section: 'cardio',
        currentText: cardio,
        coachInstruction: 'No running and no HIIT. Keep the current step target.',
        editSource: 'coach',
        clientName: onboarding.name,
        clientId: c.clientId,
        profile: onboarding,
      })
      const cardio2 = edit2.revisedText

      const checks: Check[] = [
        {
          name: 'Generated cardio is steps-only',
          ok: isStepsOnlyCardioPlan(generatedCardioFormData(cardioResult.generatedPlan, c.clientId).cardio_plan),
          detail: generatedCardioFormData(cardioResult.generatedPlan, c.clientId).cardio_plan,
        },
        {
          name: 'Edit 1 sets 10000 steps',
          ok: extractStepCount(edit1.revisedText) === 10000 && isStepsOnlyCardioPlan(edit1.revisedText),
          detail: edit1.revisedText,
        },
        {
          name: 'Edit 2 keeps 10000 steps (old request respected)',
          ok: extractStepCount(cardio2) === 10000 && isStepsOnlyCardioPlan(cardio2),
          detail: cardio2,
        },
        {
          name: 'Edit 2 did not add LISS/HIIT sessions',
          ok: !/(liss|hiit|interval|30 min)/i.test(cardio2) && isStepsOnlyCardioPlan(cardio2),
          detail: cardio2,
        },
      ]

      let dietAfterEdit1: string | undefined
      let dietAfterEdit2: string | undefined
      console.log(`  Diet sequential edits for ${label}…`)
      const dietCase = dietCoachCaseFor(c.scenario)
      const dietResult = await generatePlan({
        profile: onboarding,
        actionId: 'initial_diet',
        validationMode: 'nutrition_focus',
        coachInstructions:
          'Generate a personalized diet plan. Obey diet preference, allergies, dislikes, and the eating pattern the client described.',
      })
      let nutrition = generatedDietFormData(dietResult.generatedPlan, c.clientId).nutrition_plan ?? ''
      const dietEdit1 = await editPlanSection({
        section: 'nutrition',
        currentText: nutrition,
        coachInstruction: dietCase.clientToldCoach,
        editSource: 'coach',
        clientName: onboarding.name,
        clientId: c.clientId,
        profile: onboarding,
      })
      dietAfterEdit1 = dietEdit1.revisedText
      nutrition = dietEdit1.revisedText
      const dietEdit2 = await editPlanSection({
        section: 'nutrition',
        currentText: nutrition,
        coachInstruction: dietCase.laterCoachRequest,
        editSource: 'coach',
        clientName: onboarding.name,
        clientId: c.clientId,
        profile: onboarding,
      })
      dietAfterEdit2 = dietEdit2.revisedText
      const leftoverTold = foodsPresentInDiet(dietAfterEdit2, dietCase.mustRemainGone)
      checks.push({
        name: 'Client-told diet change still holds after later coach request',
        ok: leftoverTold.length === 0,
        detail: leftoverTold.length ? leftoverTold.join(', ') : 'ok',
      })
      if (dietCase.skipBreakfast || c.scenario.skipBreakfast) {
        checks.push({
          name: 'Breakfast stays skipped after later coach request',
          ok: !mealStillServed(dietAfterEdit2, 'breakfast'),
          detail: mealStillServed(dietAfterEdit2, 'breakfast') ? 'breakfast still served' : 'ok',
        })
      }
      if (dietCase.skipLunch || c.scenario.skipLunch) {
        checks.push({
          name: 'Lunch stays skipped after later coach request',
          ok: !mealStillServed(dietAfterEdit2, 'lunch'),
          detail: mealStillServed(dietAfterEdit2, 'lunch') ? 'lunch still served' : 'ok',
        })
      }
      const preferenceSafety = enforceDietPreference(
        { meals: [{ example: dietAfterEdit2 }] },
        onboarding.diet_preference,
        dietScanOptionsFromProfile(onboarding)
      )
      checks.push({
        name: 'Diet preference still holds after later coach request',
        ok: preferenceSafety.ok,
        detail: preferenceSafety.error ?? onboarding.diet_preference ?? 'ok',
      })
      const dislikeHits = excludedHits(dietAfterEdit2, c.scenario.mustExclude)
      checks.push({
        name: 'Profile dislikes / lifestyle excludes still hold',
        ok: dislikeHits.length === 0,
        detail: dislikeHits.length ? dislikeHits.join(', ') : 'ok',
      })

      if (planCoachId) {
        await admin.from('plans').insert({
          client_id: c.clientId,
          coach_id: planCoachId,
          title: `Coach-edit smoke ${index + 1} — ${c.scenario.id}`,
          nutrition_plan: dietAfterEdit2 || 'N/A',
          workout_plan: 'N/A',
          cardio_plan: cardio2,
          supplement_plan: '',
          coach_notes: 'Coach-edit smoke test',
          version: 1,
          active: true,
        })
      }

      const passed = checks.filter((x) => x.ok).length
      const failed = checks.filter((x) => !x.ok).length
      console.log(`  ${label}: ${passed}/${checks.length} checks passed`)
      results.push({
        index: index + 1,
        scenarioId: c.scenario.id,
        clientId: c.clientId,
        email: c.email,
        name: onboarding.name ?? c.scenario.form.name,
        cardioAfterGenerate: generatedCardioFormData(cardioResult.generatedPlan, c.clientId).cardio_plan ?? '',
        cardioAfterEdit1: edit1.revisedText,
        cardioAfterEdit2: cardio2,
        dietAfterEdit1,
        dietAfterEdit2,
        checks,
        passed,
        failed,
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error(`  ${label} failed: ${message}`)
      results.push({
        index: index + 1,
        scenarioId: c.scenario.id,
        clientId: c.clientId,
        email: c.email,
        name: c.scenario.form.name,
        cardioAfterGenerate: '',
        cardioAfterEdit1: '',
        cardioAfterEdit2: '',
        checks: [],
        passed: 0,
        failed: 1,
        error: message,
      })
    }
  }

  const summary = {
    createdAt: new Date().toISOString(),
    provider: process.env.AI_PLAN_PROVIDER,
    clients: results,
    passed: results.reduce((n, r) => n + r.passed, 0),
    failed: results.reduce((n, r) => n + r.failed, 0),
  }
  writeFileSync(path, JSON.stringify(summary, null, 2))
  console.log(`\nReport: ${path}`)
  console.log(`Totals: ${summary.passed} passed, ${summary.failed} failed`)
  if (summary.failed > 0) process.exitCode = 1
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
