import type { Checkin, Plan, PlanFormData } from '@/types/database'
import { formatAdherenceDaysForPrompt } from '@/lib/checkin-adherence-days'

export type CoachAiActionId =
  | 'initial_diet'
  | 'initial_workout'
  | 'initial_cardio'
  | 'initial_supplements'
  | 'review_update_diet'
  | 'review_update_workout'
  | 'review_update_cardio'
  | 'review_update_supplements'

export type CoachAiActionScope = 'initial' | 'weekly'

export type CoachAiActionDefinition = {
  id: CoachAiActionId
  label: string
  description: string
  scope: CoachAiActionScope
  requiresCheckin: boolean
}

export const INITIAL_PLAN_ACTIONS: CoachAiActionDefinition[] = [
  {
    id: 'initial_diet',
    label: 'Generate diet plan',
    description: 'Personalized nutrition from onboarding and eating habits',
    scope: 'initial',
    requiresCheckin: false,
  },
  {
    id: 'initial_workout',
    label: 'Generate workout plan',
    description: 'Training program from schedule, experience, and equipment',
    scope: 'initial',
    requiresCheckin: false,
  },
  {
    id: 'initial_cardio',
    label: 'Generate cardio plan',
    description: 'Standalone cardio and step targets — not part of the workout plan',
    scope: 'initial',
    requiresCheckin: false,
  },
  {
    id: 'initial_supplements',
    label: 'Generate supplement plan',
    description: 'Standalone supplement suggestions — not part of the diet plan',
    scope: 'initial',
    requiresCheckin: false,
  },
]

export const WEEKLY_COACHING_ACTIONS: CoachAiActionDefinition[] = [
  {
    id: 'review_update_diet',
    label: 'Update diet',
    description: 'Adjust nutrition based on the latest check-in',
    scope: 'weekly',
    requiresCheckin: true,
  },
  {
    id: 'review_update_workout',
    label: 'Update workout',
    description: 'Adjust training based on performance and recovery',
    scope: 'weekly',
    requiresCheckin: true,
  },
  {
    id: 'review_update_cardio',
    label: 'Update cardio',
    description: 'Adjust cardio and steps based on the latest check-in',
    scope: 'weekly',
    requiresCheckin: true,
  },
  {
    id: 'review_update_supplements',
    label: 'Update supplements',
    description: 'Adjust supplements based on the latest check-in',
    scope: 'weekly',
    requiresCheckin: true,
  },
]

const ACTION_MAP = Object.fromEntries(
  [...INITIAL_PLAN_ACTIONS, ...WEEKLY_COACHING_ACTIONS].map((a) => [a.id, a])
) as Record<CoachAiActionId, CoachAiActionDefinition>

export function getCoachAiAction(id: string): CoachAiActionDefinition | null {
  return ACTION_MAP[id as CoachAiActionId] ?? null
}

export function isCoachAiActionId(id: string): id is CoachAiActionId {
  return id in ACTION_MAP
}

function appendNote(base: string, coachNote?: string | null): string {
  const parts = [base]
  if (coachNote?.trim()) parts.push(`Coach note: ${coachNote.trim()}`)
  return parts.join('\n\n')
}

function planContext(plan: Plan | null, fields: ('nutrition' | 'workout' | 'cardio' | 'supplements')[]): string {
  if (!plan) return ''
  const lines: string[] = ['Current active plan context:']
  if (fields.includes('nutrition') && plan.nutrition_plan) {
    lines.push(`Nutrition (v${plan.version}):\n${plan.nutrition_plan.slice(0, 1200)}`)
  }
  if (fields.includes('workout') && plan.workout_plan) {
    lines.push(`Workout (v${plan.version}):\n${plan.workout_plan.slice(0, 1200)}`)
  }
  if (fields.includes('cardio') && plan.cardio_plan) {
    lines.push(`Cardio (v${plan.version}):\n${plan.cardio_plan.slice(0, 800)}`)
  }
  if (fields.includes('supplements') && plan.supplement_plan) {
    lines.push(`Supplements (v${plan.version}):\n${plan.supplement_plan.slice(0, 800)}`)
  }
  return lines.length > 1 ? lines.join('\n\n') : ''
}

function checkinContext(checkin: Checkin): string {
  return [
    'Latest check-in context:',
    `Weight: ${checkin.weight ?? '—'} kg`,
    `Waist / navel: ${checkin.navel ?? checkin.waist ?? '—'} cm`,
    `Diet adherence: ${checkin.diet_adherence ?? checkin.adherence_score ?? '—'}/10`,
    `Workout adherence: ${checkin.workout_adherence ?? checkin.training_performance ?? '—'}/10`,
    `Days followed diet: ${checkin.days_followed_diet ?? '—'}`,
    `Days trained: ${checkin.days_followed_workout ?? '—'}`,
    `Days sleep on target: ${checkin.days_followed_sleep ?? '—'}`,
    `Days water on target: ${checkin.days_followed_water ?? '—'}`,
    `Days steps on target: ${checkin.days_followed_steps ?? '—'}`,
    `Energy: ${checkin.energy_level ?? '—'}/10`,
    `Sleep: ${checkin.sleep_quality ?? '—'}/10`,
    `Stress: ${checkin.stress_level ?? '—'}/10`,
    `Hunger: ${checkin.hunger_level ?? '—'}/10`,
    `Motivation: ${checkin.motivation_level ?? '—'}/10`,
    `Progress rating: ${checkin.progress_rating ?? '—'}/10`,
    checkin.progress_notes?.trim() ? `Progress notes: ${checkin.progress_notes.trim()}` : null,
    checkin.adherence_wins?.trim() ? `Wins: ${checkin.adherence_wins.trim()}` : null,
    checkin.adherence_struggles?.trim()
      ? `Struggles: ${checkin.adherence_struggles.trim()}`
      : null,
    checkin.pain_injuries?.trim() ? `Pain/injuries: ${checkin.pain_injuries.trim()}` : null,
    checkin.questions_for_coach?.trim()
      ? `Questions: ${checkin.questions_for_coach.trim()}`
      : null,
    checkin.digestion?.trim() ? `Digestion: ${checkin.digestion.trim()}` : null,
    checkin.notes?.trim() ? `Additional notes: ${checkin.notes.trim()}` : null,
  ]
    .filter(Boolean)
    .join('\n')
}

/** Maps a coach-facing action to internal coaching instructions (never shown in UI). */
export function buildActionCoachInstructions(
  actionId: CoachAiActionId,
  options: {
    coachNote?: string | null
    activePlan?: Plan | null
    checkin?: Checkin | null
  }
): string {
  const { coachNote, activePlan, checkin } = options

  switch (actionId) {
    case 'initial_diet':
      return appendNote(
        [
          'Generate a personalized diet plan for this client.',
          'CRITICAL: Obey diet preference from Hard Constraints on every meal — vegetarian means zero eggs/meat/fish/whey ever; non-veg only on allowed weekdays.',
          'CRITICAL: Build from the client\'s lifestyle and eating pattern — their meal times, favorite foods, cooking ability, work schedule, and budget — never a random generic chart.',
          'Derive daily calories with Mifflin-St Jeor from the CALORIE METHOD in the profile (BMR × activity, then goal adjustment).',
          'Follow Metabolic Flux Bias: pair higher absolute food intake with higher output — avoid deep deficits with low movement.',
          'Always specify exact ghee/oil/butter amounts for cooked meals and a daily cooking-fat total.',
          'Obey the client meal-variety preference (same daily / 50-50 / different daily).',
          'Do NOT include cardio, conditioning, steps, or supplements in the diet text.',
          'Leave cardio_plan.sessions and supplement_plan.items as empty arrays.',
          'Align meals with their reported eating pattern and meal timings.',
          'For workout_plan set overview to "N/A" and days to an empty array.',
        ].join(' '),
        coachNote
      )
    case 'initial_workout':
      return appendNote(
        [
          'Generate a personalized workout plan for this client.',
          'Opening mesocycle week 1: invent a COMPLETELY UNIQUE muscle-shock split for this client — not a stock PPL/upper-lower/bro template.',
          'Use BASE (lowest) volume for week 1 of the mesocycle.',
          'Follow Metabolic Flux Bias for session density and daily step targets within hard day/duration caps.',
          'Prioritize workout_plan only (strength / resistance training).',
          'Do NOT include a Cardio, Steps, Conditioning, or Supplements section in the workout text.',
          'Leave cardio_plan.sessions and supplement_plan.items as empty arrays — those are separate plans.',
          'Respect training days, equipment, injuries, and experience level.',
          'For nutrition_plan use minimal placeholder macros (0) and empty meals array.',
          'Set coach_notes to a brief summary of training priorities only.',
        ].join(' '),
        coachNote
      )
    case 'initial_cardio':
      return appendNote(
        [
          'Generate a standalone cardio plan for this client.',
          'Put all cardio, steps, walking, LISS, HIIT, and conditioning in cardio_plan.sessions only.',
          'Follow Metabolic Flux Bias: raise sustainable steps/NEAT with higher food intake; prefer walks/LISS over punishing HIIT when pushing flux.',
          'Do NOT put cardio inside workout_plan or nutrition_plan.',
          'Set workout_plan.overview to "N/A", nutrition meals to [], and supplement_plan.items to [].',
          'Match frequency and intensity to their goal, schedule, and recovery.',
        ].join(' '),
        coachNote
      )
    case 'initial_supplements':
      return appendNote(
        [
          'Generate a standalone supplement plan for this client.',
          'Put all supplement recommendations in supplement_plan.items only.',
          'Do NOT put supplements inside nutrition_plan or workout_plan.',
          'Set workout_plan.overview to "N/A", nutrition meals to [], and cardio_plan.sessions to [].',
          'Respect diet preference, current supplements, budget, and medical notes (informational only).',
        ].join(' '),
        coachNote
      )
    case 'review_update_diet':
      return appendNote(
        [
          'Update the diet plan based on the latest check-in.',
          'CRITICAL: Obey diet preference from Hard Constraints on every meal — never add eggs/meat/fish on veg days or for vegetarian clients.',
          'CRITICAL: Respect the client\'s lifestyle and current diet — meal times, favorite foods, cooking ability, work schedule, budget — adjust what check-in requires; never replace with a random generic chart.',
          checkin ? checkinContext(checkin) : '',
          checkin ? formatAdherenceDaysForPrompt(checkin, checkin.checkin_type === 'mid_week' ? 3 : 7) : '',
          planContext(activePlan ?? null, ['nutrition']),
          'CRITICAL: Address every client request, struggle, question, and check-in flag with concrete meal/macro changes.',
          'Do NOT return a near-copy of the current diet. State what changed and why in the opening lines, then deliver a full 7-day plan that reflects those changes.',
          'If the client asked to swap foods, change portions, simplify meals, or fix hunger/adherence — those edits must be visible in the meal lists.',
          'Put a short Diet tips block at the top of the diet prose based on days followed (simplify if low, polish if high). Also include a Hydration note with a daily water target.',
          'The client-facing plan title/header MAY show Week N. Do not write Welcome to week N greetings in meal prose.',
          'Adjust nutrition_plan only.',
          'Always specify exact ghee/oil/butter amounts for cooked meals and a daily cooking-fat total.',
          'Obey the client meal-variety preference (same daily / 50-50 / different daily).',
          'Do NOT include cardio or supplements in the diet text; leave those JSON arrays empty.',
          'Keep workout_plan minimal with overview "N/A" and days [].',
        ]
          .filter(Boolean)
          .join('\n\n'),
        coachNote
      )
    case 'review_update_workout':
      return appendNote(
        [
          'Update the workout plan based on the latest check-in and Training Mesocycle context.',
          checkin ? checkinContext(checkin) : '',
          checkin ? formatAdherenceDaysForPrompt(checkin, checkin.checkin_type === 'mid_week' ? 3 : 7) : '',
          planContext(activePlan ?? null, ['workout']),
          'CRITICAL: Address every client request, struggle, pain note, and check-in flag with concrete exercise/volume/split changes.',
          'Do NOT return a near-copy of the current workout. Opening lines must name what changed; day lists must show the edits.',
          'If the client asked for easier/harder sessions, different exercises, home vs gym, or injury workarounds — those must appear in the days.',
          'Obey mesocycle rules: week 1 of a month = NEW unique split + base volume; weeks 2–4 = same split with rising volume; after week 4 reset.',
          'Open the workout with a short training-tips block based on days trained (deload/simplify if low, progress if high). Include a Sleep recovery note.',
          'The plan header MAY show Week N. Do not write Welcome to week N in exercise lists.',
          'Adjust workout_plan only (strength / resistance training).',
          'Do NOT include Cardio or Supplements sections in the workout text; leave those JSON arrays empty.',
          'Keep nutrition_plan with placeholder macros and empty meals.',
        ]
          .filter(Boolean)
          .join('\n\n'),
        coachNote
      )
    case 'review_update_cardio':
      return appendNote(
        [
          'Update the cardio plan based on the latest check-in.',
          checkin ? checkinContext(checkin) : '',
          checkin ? formatAdherenceDaysForPrompt(checkin, checkin.checkin_type === 'mid_week' ? 3 : 7) : '',
          planContext(activePlan ?? null, ['cardio', 'workout']),
          'Put updates only in cardio_plan.sessions.',
          'Always refresh daily steps AND walking/cardio. If steps days are low, give a realistic step floor and how to hit it. If high, progress slightly.',
          'Include a short sleep and water reminder in session notes.',
          'Do not modify diet or workout content.',
        ]
          .filter(Boolean)
          .join('\n\n'),
        coachNote
      )
    case 'review_update_supplements':
      return appendNote(
        [
          'Update the supplement plan based on the latest check-in.',
          checkin ? checkinContext(checkin) : '',
          checkin ? formatAdherenceDaysForPrompt(checkin, checkin.checkin_type === 'mid_week' ? 3 : 7) : '',
          planContext(activePlan ?? null, ['supplements', 'nutrition']),
          'Put updates only in supplement_plan.items.',
          'Refresh timing notes if sleep or diet days were low (simpler stack).',
          'Do not modify diet or workout content.',
        ]
          .filter(Boolean)
          .join('\n\n'),
        coachNote
      )
    default:
      return coachNote?.trim() ?? ''
  }
}

export type AiReasoningDisplay = {
  complexityTier: string
  complexityScore: number
  model: string
  knowledgeReferences: string[]
  summary: string
}

const KNOWLEDGE_LABELS: Record<string, string> = {
  fat_loss: 'Fat loss',
  muscle_gain: 'Muscle gain',
  recomposition: 'Recomposition',
  strength: 'Strength',
  nutrition: 'Nutrition',
  cardio: 'Cardio',
  supplements: 'Supplements',
  recovery: 'Recovery',
  checkins: 'Check-ins',
  injuries: 'Injuries',
  female: 'Female-specific',
  beginner: 'Beginner training',
  intermediate: 'Intermediate training',
  advanced: 'Advanced training',
}

export function formatKnowledgeReference(category: string): string {
  return KNOWLEDGE_LABELS[category] ?? category.replace(/_/g, ' ')
}

export function buildAiReasoningDisplay(input: {
  complexityTier: string
  complexityScore: number
  model: string
  knowledgeCategories: string[]
  coachNotes: string
  complexityReasons: string[]
}): AiReasoningDisplay {
  const summaryLines = input.coachNotes
    .trim()
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 3)

  if (summaryLines.length === 0 && input.complexityReasons.length > 0) {
    summaryLines.push(
      ...input.complexityReasons.slice(0, 2).map((r) => r.replace(/^\+\d+:\s*/, ''))
    )
  }

  return {
    complexityTier: input.complexityTier,
    complexityScore: input.complexityScore,
    model: input.model,
    knowledgeReferences: input.knowledgeCategories.map(formatKnowledgeReference),
    summary: summaryLines.join(' ').slice(0, 320) || 'Plan generated from client profile and coaching knowledge.',
  }
}

export function mergePlanForms(base: PlanFormData, patch: Partial<PlanFormData>): PlanFormData {
  return {
    ...base,
    ...patch,
    title: patch.title ?? base.title,
    phase: patch.phase ?? base.phase,
    workout_plan: patch.workout_plan?.trim() ? patch.workout_plan : base.workout_plan,
    nutrition_plan: patch.nutrition_plan?.trim() ? patch.nutrition_plan : base.nutrition_plan,
    cardio_plan: patch.cardio_plan?.trim() ? patch.cardio_plan : base.cardio_plan,
    supplement_plan: patch.supplement_plan?.trim() ? patch.supplement_plan : base.supplement_plan,
    coach_notes: patch.coach_notes?.trim() ? patch.coach_notes : base.coach_notes,
  }
}
