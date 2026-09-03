/**
 * Natural Testosterone Support Protocol â€” the paid checkout add-on.
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
import type { AddonProtocolId } from '@/lib/addon-protocols'
import { profileEntitledForAddon } from '@/lib/addon-protocols'

const TESTO_PROMPT_VERSION = 'testosterone-support-protocol-v1'

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
    `Available training days: ${(training.availableDays ?? []).filter(Boolean).join(', ') || 'Not provided'}`,
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

function promptsForAddon(addonId: AddonProtocolId): { version: string; system: string; sections: string } {
  if (addonId === 'anxiety_removal') {
    return {
      version: 'anxiety-removal-protocol-v1',
      system: [
        'You are a senior lifestyle coach at LURVOX writing for one Indian client.',
        'You write a paid Anxiety removal protocol: daily habits for stress, sleep, and a calmer week.',
        'You are NOT a therapist, psychiatrist, or doctor. This is coaching, not treatment.',
        'You NEVER recommend prescription medicine, diagnose anxiety disorders, or replace therapy.',
        'If they mention panic, self-harm, or severe distress, tell them to see a qualified clinician.',
        'Write in plain English. Use rupees if you mention costs. No hype.',
      ].join(' '),
      sections: [
        'Write their Anxiety removal protocol in Markdown using EXACTLY these six sections, in order:',
        '',
        '## What this protocol is (and is not)',
        'Say this is coach-built habits for a calmer week, not therapy and not medicine.',
        'Tie 2â€“3 stress or sleep patterns from their answers to what you will work on.',
        '',
        '## Sleep and evenings',
        'Give a concrete wind-down and sleep window based on their sleep answers.',
        '',
        '## Daytime stress habits',
        'Short, doable tools: walks, breathing, caffeine timing, work breaks. No clinical CBT worksheets.',
        '',
        '## Training and body',
        'How their training days should feel so they do not add more stress. Tailor to location and days per week.',
        '',
        '## Food, caffeine and supplements',
        'At most 2 supplements with genuine evidence for sleep or stress (e.g. magnesium glycinate if food is short). Never herbal â€œanxiety cureâ€ blends. Costs in rupees.',
        '',
        '## When to get extra help',
        'List signs they should see a doctor or therapist. Repeat this is not treatment.',
      ].join('\n'),
    }
  }

  if (addonId === 'face_maxxing') {
    return {
      version: 'face-maxxing-protocol-v1',
      system: [
        'You are a senior lifestyle coach at LURVOX writing for one Indian client.',
        'You write a paid Face maxxing protocol: sleep, salt, skin, posture, and grooming.',
        'Lifestyle only. You NEVER recommend surgery, fillers, prescriptions, or medical treatments.',
        'You never promise a jawline, height, or bone change. Be honest about what habits can and cannot do.',
        'Write in plain English. Use rupees for product costs. No hype.',
      ].join(' '),
      sections: [
        'Write their Face maxxing protocol in Markdown using EXACTLY these six sections, in order:',
        '',
        '## What actually changes a face',
        'Sleep, body fat, salt/water, skin care, posture, and grooming. Not surgery. Tie to THIS person.',
        '',
        '## Sleep and body fat',
        'How sleep debt and high body fat show on the face. Targets from their answers.',
        '',
        '## Salt, water and puffiness',
        'Practical salt and water habits. No extreme â€œdry outâ€ diets.',
        '',
        '## Skin, sun and grooming',
        'A simple AM/PM routine they can buy in India, with rupee costs. No prescription retinoids unless they already use them via a doctor.',
        '',
        '## Posture, chewing and daily look',
        'Posture and basic grooming. No mewing-as-miracle or bone-changing claims.',
        '',
        '## Stay safe',
        'This is lifestyle, not a medical or surgical plan. See a dermatologist for skin disease.',
      ].join('\n'),
    }
  }

  return {
    version: TESTO_PROMPT_VERSION,
    system: SYSTEM_PROMPT,
    sections: [
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
    ].join('\n'),
  }
}

function buildUserPrompt(profile: OnboardingProfile, addonId: AddonProtocolId = 'testo_boost'): string {
  const { sections } = promptsForAddon(addonId)
  return [
    buildClientFacts(profile),
    '',
    sections,
    '',
    'Rules:',
    'Address them by first name once at the start, then get straight into it.',
    'Keep the whole document between 550 and 850 words.',
    'No bold-everything, no emojis, no marketing language.',
    'Do not mention AI, prompts, or that this was generated.',
    'If their answers are missing key information, say what you assumed rather than inventing detail.',
  ].join('\n')
}

/** Current protocol row for a client and add-on, if any. */
export async function loadSupplementProtocol(
  clientId: string,
  addonId: AddonProtocolId = 'testo_boost'
): Promise<SupplementProtocol | null> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('supplement_protocols')
    .select('*')
    .eq('client_id', clientId)
    .eq('addon_id', addonId)
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
 * add-on â€” the entitlement is checked here so no caller can hand out the paid document by mistake.
 */
export async function generateSupplementProtocol(input: {
  clientId: string
  purchaseId?: string | null
  force?: boolean
  addonId?: AddonProtocolId
}): Promise<GenerateSupplementProtocolResult> {
  const admin = createAdminClient()
  const addonId = input.addonId ?? 'testo_boost'
  const prompt = promptsForAddon(addonId)

  const { data: profileRow } = await admin
    .from('profiles')
    .select('*')
    .eq('id', input.clientId)
    .maybeSingle()

  if (!profileRow) {
    return { status: 'skipped', content: null, error: 'profile_not_found', cached: false }
  }

  const profile = profileRow as OnboardingProfile
  if (!profileEntitledForAddon(profile, addonId)) {
    return { status: 'skipped', content: null, error: 'not_entitled', cached: false }
  }

  const existing = await loadSupplementProtocol(input.clientId, addonId)
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
      systemPrompt: prompt.system,
      userPrompt: buildUserPrompt(profile, addonId),
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
        addon_id: addonId,
        version: nextVersion,
        status: 'ready',
        content,
        error_message: null,
        generated_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'client_id,addon_id' }
    )

    await logAiGeneration({
      clientId: input.clientId,
      coachId: profile.coach_id ?? null,
      action: 'supplement_protocol',
      model: result.model,
      promptVersion: prompt.version,
      latencyMs: Date.now() - started,
      promptTokens: result.inputTokens,
      completionTokens: result.outputTokens,
      retryCount: result.retryCount,
      validationResult: 'ok',
      success: true,
      knowledgeRefs: null,
      renderedOutput: { clientId: input.clientId, version: nextVersion, addonId },
    })

    return { status: 'ready', content, error: null, cached: false }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Supplement protocol generation failed'

    await admin.from('supplement_protocols').upsert(
      {
        client_id: input.clientId,
        purchase_id: input.purchaseId ?? existing?.purchase_id ?? null,
        addon_id: addonId,
        version: existing?.version ?? 1,
        // Keep any previously delivered document readable instead of blanking the page.
        status: existing?.content?.trim() ? 'ready' : 'failed',
        error_message: message,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'client_id,addon_id' }
    )

    await logAiGeneration({
      clientId: input.clientId,
      coachId: profile.coach_id ?? null,
      action: 'supplement_protocol',
      model: MODELS.CLAUDE_SONNET,
      promptVersion: prompt.version,
      latencyMs: Date.now() - started,
      promptTokens: null,
      completionTokens: null,
      retryCount: 0,
      validationResult: message,
      success: false,
      knowledgeRefs: null,
      renderedOutput: { clientId: input.clientId, addonId },
    })

    return { status: 'failed', content: existing?.content ?? null, error: message, cached: false }
  }
}

/** Generate on first read if the client is owed the document but it does not exist yet. */
export async function ensureSupplementProtocol(
  clientId: string,
  addonId: AddonProtocolId = 'testo_boost'
): Promise<GenerateSupplementProtocolResult> {
  const existing = await loadSupplementProtocol(clientId, addonId)
  if (existing?.status === 'ready' && existing.content?.trim()) {
    return { status: 'ready', content: existing.content, error: null, cached: true }
  }
  return generateSupplementProtocol({ clientId, addonId })
}
