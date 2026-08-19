/**
 * Natural Testosterone Support Protocol — the paid checkout add-on.
 *
 * Built from the client's own onboarding answers (goal, budget, diet, training, sleep, medical
 * notes) so it is a real deliverable rather than generic advice. Deliberately conservative: it
 * covers the lifestyle, training, sleep, nutrition and well-evidenced supplement levers that
 * support the body's own testosterone, names what is a waste of money, and defers anything medical
 * to a doctor. It NEVER prescribes testosterone, hormones, steroids, SARMs or peptides, and never
 * promises a specific hormone level or increase.
 */
import { MODELS } from '@/lib/ai/config'
import { generateClaudeResponse } from '@/lib/ai/anthropic'
import { logAiGeneration } from '@/lib/ai/trace-log'
import { createAdminClient } from '@/lib/supabase/admin'
import type { OnboardingProfile, SupplementProtocol } from '@/types/database'

const PROMPT_VERSION = 'testosterone-support-protocol-v1'

function value(raw: unknown): string {
  if (raw == null) return 'not provided'
  const text = String(raw).trim()
  return text || 'not provided'
}

function buildClientFacts(profile: OnboardingProfile): string {
  const data = profile.onboarding_data ?? null
  const diet = data?.diet ?? {}
  const medical = data?.medical ?? {}
  const training = data?.training ?? {}
  const goals = data?.goals ?? {}
  const lifestyle = data?.lifestyle ?? {}

  return [
    '## Who this is for',
    `Name: ${value(profile.name)}`,
    `Age: ${value(profile.age)}`,
    `Gender: ${value(profile.gender)}`,
    `Weight (kg): ${value(profile.weight)}`,
    `Height (cm): ${value(profile.height)}`,
    `Primary goal: ${value(profile.fitness_goal)}`,
    `Selected goals: ${value(goals.selectedGoals?.join(', '))}`,
    `Target weight: ${value(goals.targetWeight)}`,
    `Biggest struggle: ${value(goals.biggestStruggle)}`,
    '',
    '## Diet and budget',
    `Diet preference: ${value(profile.diet_preference)}`,
    `Monthly food budget: ${value(diet.monthlyFoodBudget)}`,
    `Already uses whey protein: ${value(diet.wheyProtein)}`,
    `Egg days per week: ${value(diet.eggDaysPerWeek)}`,
    `Chicken days per week: ${value(diet.chickenDaysPerWeek)}`,
    `Fish days per week: ${value(diet.fishDaysPerWeek)}`,
    `Allergies: ${value(diet.allergies)}`,
    `Foods disliked: ${value(diet.foodsDisliked)}`,
    `Cooking ability: ${value(diet.cookingAbility)}`,
    '',
    '## Training and lifestyle',
    `Training location: ${value(training.location)}`,
    `Training experience: ${value(profile.training_experience)}`,
    `Days per week: ${value(training.daysPerWeek)}`,
    `Session length (min): ${value(training.durationMinutes)}`,
    `Preferred training time: ${value(training.preferredTime)}`,
    `Activity level: ${value(profile.activity_level)}`,
    `Daily steps: ${value(lifestyle.dailySteps)}`,
    `Sleep duration: ${value(profile.sleep_duration)}`,
    `Stress level: ${value(lifestyle.stressLevel)}`,
    `Water intake: ${value(lifestyle.waterIntake)}`,
    '',
    '## Health context (treat with care)',
    `Medical conditions: ${value(medical.conditions)}`,
    `Medications: ${value(medical.medications)}`,
    `Injuries: ${value(profile.injuries)}`,
    `Other medical notes: ${value(profile.medical_notes)}`,
    `Acne: ${value(medical.acne)}`,
    `Hair loss: ${value(medical.hairLoss)}`,
    '',
    '## Supplements they already take',
    value(data?.supplements?.current),
  ].join('\n')
}

const SYSTEM_PROMPT = [
  'You are a senior evidence-based fitness and nutrition coach at LURVOX writing for one Indian client.',
  'You write a paid, personalised Natural Testosterone Support Protocol they read in their coaching app.',
  'The whole document is about supporting the body\'s OWN testosterone through training, sleep, body fat, nutrition, stress and a few well-evidenced supplements.',
  'You are honest above all: lifestyle beats pills, most testosterone-booster products are a waste of money, and you say so plainly.',
  'You NEVER prescribe or recommend testosterone, TRT, anabolic steroids, SARMs, peptides, hCG, aromatase inhibitors, or any hormone or prescription drug.',
  'You NEVER promise a specific testosterone number, a guaranteed increase, or a disease cure.',
  'You make clear that if someone suspects genuinely low testosterone, that is a doctor and blood-test matter, not a supplement matter.',
  'You never claim a supplement treats, cures, or prevents any disease.',
  'Write in plain English an average reader understands. Use rupees for costs. No hype, no bro-science.',
].join(' ')

function buildUserPrompt(profile: OnboardingProfile): string {
  return [
    buildClientFacts(profile),
    '',
    'Write their Natural Testosterone Support Protocol in Markdown using EXACTLY these six sections, in order:',
    '',
    '## What actually drives your testosterone',
    'Plainly explain that natural testosterone is mostly driven by body fat, strength training, sleep, stress and a few nutrients, not by pills.',
    'Tie it to THIS person: call out the 2 to 3 levers that matter most for them based on their answers (e.g. high body fat, poor sleep, high stress, low training age).',
    'Be encouraging but realistic. No guarantees, no numbers promised.',
    '',
    '## Train and move for it',
    'Give concrete training guidance that supports testosterone: heavy compound lifts, progressive overload, not overtraining, managing excessive cardio.',
    'Tailor it to their training location, experience, days per week and goal.',
    '',
    '## Sleep, stress and body fat',
    'Explain how sleep debt, chronic stress and high body fat suppress natural testosterone.',
    'Give specific, doable targets tied to their answers (sleep hours, steps, stress, waist/body fat direction).',
    '',
    '## Food and nutrients that help',
    'Cover the nutrition levers: enough calories (not crash dieting), protein, healthy fats, and micronutrients like zinc, magnesium and vitamin D.',
    'Prefer food sources first and tie to their diet, budget and what they already eat. If their food already covers a need, say so and do not sell a product.',
    '',
    '## Supplements worth it vs a waste of money',
    'List at most 3 or 4 supplements with genuine evidence for THIS person (commonly vitamin D if deficient, magnesium, zinc, creatine, and adequate protein).',
    'For each: what it does, the dose, when to take it, and a realistic monthly cost in rupees.',
    'Then name the popular testosterone-booster products that are a waste of money (e.g. tribulus, most proprietary "test booster" blends) and why in one line each.',
    'Include anything from their current supplement list they should stop buying.',
    '',
    '## Get tested and stay safe',
    'List the few blood markers worth checking (e.g. total and free testosterone, vitamin D, thyroid, fasting glucose) and say a doctor or lab must interpret them, not a coach.',
    'State clearly that this is lifestyle and nutrition guidance, not medical advice, and not hormone therapy.',
    'Tell them to see a doctor before starting anything if they take medication or have a health condition, and that suspected low testosterone needs a doctor.',
    '',
    'Rules:',
    'Address them by first name once at the start, then get straight into it.',
    'Keep the whole document between 550 and 850 words.',
    'No bold-everything, no emojis, no marketing language.',
    'Never imply this raises testosterone to a guaranteed level or replaces medical treatment.',
    'Do not mention AI, prompts, or that this was generated.',
    'If their answers are missing key information, say what you assumed rather than inventing detail.',
  ].join('\n')
}

/** Current protocol row for a client, if any. */
export async function loadSupplementProtocol(clientId: string): Promise<SupplementProtocol | null> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('supplement_protocols')
    .select('*')
    .eq('client_id', clientId)
    .maybeSingle()

  return (data as SupplementProtocol | null) ?? null
}

export type GenerateSupplementProtocolResult = {
  status: 'ready' | 'failed' | 'skipped'
  content: string | null
  error: string | null
  cached: boolean
}

/**
 * Generate (or regenerate) the protocol and store it. Requires the client to have paid for the
 * add-on — the entitlement is checked here so no caller can hand out the paid document by mistake.
 */
export async function generateSupplementProtocol(input: {
  clientId: string
  purchaseId?: string | null
  force?: boolean
}): Promise<GenerateSupplementProtocolResult> {
  const admin = createAdminClient()

  const { data: profileRow } = await admin
    .from('profiles')
    .select('*')
    .eq('id', input.clientId)
    .maybeSingle()

  if (!profileRow) {
    return { status: 'skipped', content: null, error: 'profile_not_found', cached: false }
  }

  const profile = profileRow as OnboardingProfile
  if (!profile.supplement_protocol_entitled) {
    return { status: 'skipped', content: null, error: 'not_entitled', cached: false }
  }

  const existing = await loadSupplementProtocol(input.clientId)
  if (!input.force && existing?.status === 'ready' && existing.content?.trim()) {
    return { status: 'ready', content: existing.content, error: null, cached: true }
  }

  // Onboarding answers are the whole value of this document, so wait for them.
  if (!profile.onboarding_complete) {
    return { status: 'skipped', content: null, error: 'onboarding_incomplete', cached: false }
  }

  const nextVersion = (existing?.version ?? 0) + 1
  const started = Date.now()

  try {
    const result = await generateClaudeResponse({
      systemPrompt: SYSTEM_PROMPT,
      userPrompt: buildUserPrompt(profile),
      model: MODELS.CLAUDE_SONNET,
      maxTokens: 2000,
      temperature: 0.4,
    })

    const content = result.text.trim()
    if (content.length < 200) throw new Error('Supplement protocol came back too short')

    await admin.from('supplement_protocols').upsert(
      {
        client_id: input.clientId,
        purchase_id: input.purchaseId ?? existing?.purchase_id ?? null,
        version: nextVersion,
        status: 'ready',
        content,
        error_message: null,
        generated_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'client_id' }
    )

    await logAiGeneration({
      clientId: input.clientId,
      coachId: profile.coach_id ?? null,
      action: 'supplement_protocol',
      model: result.model,
      promptVersion: PROMPT_VERSION,
      latencyMs: Date.now() - started,
      promptTokens: result.inputTokens,
      completionTokens: result.outputTokens,
      retryCount: result.retryCount,
      validationResult: 'ok',
      success: true,
      knowledgeRefs: null,
      renderedOutput: { clientId: input.clientId, version: nextVersion },
    })

    return { status: 'ready', content, error: null, cached: false }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Supplement protocol generation failed'

    await admin.from('supplement_protocols').upsert(
      {
        client_id: input.clientId,
        purchase_id: input.purchaseId ?? existing?.purchase_id ?? null,
        version: existing?.version ?? 1,
        // Keep any previously delivered document readable instead of blanking the page.
        status: existing?.content?.trim() ? 'ready' : 'failed',
        error_message: message,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'client_id' }
    )

    await logAiGeneration({
      clientId: input.clientId,
      coachId: profile.coach_id ?? null,
      action: 'supplement_protocol',
      model: MODELS.CLAUDE_SONNET,
      promptVersion: PROMPT_VERSION,
      latencyMs: Date.now() - started,
      promptTokens: null,
      completionTokens: null,
      retryCount: 0,
      validationResult: message,
      success: false,
      knowledgeRefs: null,
      renderedOutput: { clientId: input.clientId },
    })

    return { status: 'failed', content: existing?.content ?? null, error: message, cached: false }
  }
}

/** Generate on first read if the client is owed the document but it does not exist yet. */
export async function ensureSupplementProtocol(
  clientId: string
): Promise<GenerateSupplementProtocolResult> {
  const existing = await loadSupplementProtocol(clientId)
  if (existing?.status === 'ready' && existing.content?.trim()) {
    return { status: 'ready', content: existing.content, error: null, cached: true }
  }
  return generateSupplementProtocol({ clientId })
}
