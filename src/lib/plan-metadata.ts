import type { Plan } from '@/types/database'

export type PlanMeta = {
  checkinId?: string
  week?: number
  generatedBy: 'ai' | 'coach'
  source?: string
}

const META_PREFIX = '@@META'
const META_SUFFIX = '@@'

export function encodePlanMeta(meta: PlanMeta, coachNotes?: string | null): string | null {
  const payload = JSON.stringify(meta)
  const notes = coachNotes?.trim() ?? ''
  if (!notes) return `${META_PREFIX}${payload}${META_SUFFIX}`
  if (notes.includes(META_PREFIX)) return notes
  return `${META_PREFIX}${payload}${META_SUFFIX}\n${notes}`
}

export function parsePlanMeta(plan: Pick<Plan, 'title' | 'coach_notes' | 'phase'>): PlanMeta {
  const notes = plan.coach_notes ?? ''
  const match = notes.match(/@@META(\{.*?\})@@/)
  if (match?.[1]) {
    try {
      const parsed = JSON.parse(match[1]) as PlanMeta
      return { ...parsed, generatedBy: parsed.generatedBy ?? 'ai' }
    } catch {
      /* fall through */
    }
  }

  const isAi = isAiDraftTitle(plan.title)
  const weekMatch = plan.title.match(/Week\s+(\d+)/i)
  return {
    generatedBy: isAi ? 'ai' : 'coach',
    week: weekMatch ? Number(weekMatch[1]) : undefined,
    source: isAi && weekMatch ? `Week ${weekMatch[1]} Check-in` : undefined,
  }
}

export function stripPlanMeta(notes: string | null | undefined): string {
  if (!notes) return ''
  return notes.replace(/@@META\{.*?\}@@\n?/, '').trim()
}

export function isAiDraftTitle(title: string | null | undefined): boolean {
  const raw = (title ?? '').trim()
  return /^AI\b/i.test(raw)
}

export function extractWeekFromTitle(title: string | null | undefined): number | undefined {
  const match = (title ?? '').match(/Week\s+(\d+)/i)
  return match ? Number(match[1]) : undefined
}

export function planMatchesCheckin(
  plan: Pick<Plan, 'coach_notes' | 'title' | 'phase'>,
  checkinId: string
): boolean {
  return parsePlanMeta(plan).checkinId === checkinId
}

/** Client-facing coach notes for editors, comparison, and prompts. */
export function clientCoachNotes(notes: string | null | undefined): string {
  return stripPlanMeta(notes)
}

/** Re-attach internal metadata when saving an AI draft from the coach editor. */
export function prepareCoachNotesForSave(
  clientNotes: string,
  plan: Pick<Plan, 'coach_notes' | 'title' | 'phase'>
): string | null {
  const trimmed = stripPlanMeta(clientNotes).trim()
  if (!trimmed) return null

  const meta = parsePlanMeta(plan)
  if (meta.checkinId && isAiDraftTitle(plan.title)) {
    return encodePlanMeta(meta, trimmed)
  }

  return trimmed
}

/** Default client-facing message when an AI draft only has internal @@META. */
export function fallbackPublishCoachNotes(
  plan: Pick<Plan, 'title' | 'coach_notes' | 'phase'>
): string {
  const meta = parsePlanMeta(plan)
  // Client-requested edits are not a new coaching-week handoff.
  if (meta.source === 'client_plan_change' || /client request/i.test(plan.title ?? '')) {
    return 'Your updated plan is ready. Keep building on your consistency — your coach is here if you need anything.'
  }
  const week = meta.week ?? extractWeekFromTitle(plan.title)
  if (week) {
    return `Your Week ${week} plan is ready. Keep building on your consistency — your coach is here if you need anything.`
  }
  return 'Your updated plan is ready. Keep building on your consistency — your coach is here if you need anything.'
}

/** Strip metadata and validate before delivering a plan to the client. */
export function prepareCoachNotesForPublish(
  notes: string | null | undefined,
  options?: {
    /** When set, empty client notes use this instead of blocking publish. */
    fallbackMessage?: string | null
  }
): {
  notes: string | null
  error: string | null
  usedFallback?: boolean
} {
  const cleaned = stripPlanMeta(notes).trim()
  if (cleaned) {
    return { notes: cleaned, error: null }
  }

  const fallback = options?.fallbackMessage?.trim()
  if (fallback) {
    return { notes: fallback, error: null, usedFallback: true }
  }

  return {
    notes: null,
    error: 'Cannot publish: Coach Notes must include a client-facing message.',
  }
}

export function formatPublishedPlanTitle(
  plan: Pick<Plan, 'title' | 'coach_notes' | 'phase'>,
  isUpdate: boolean
): string {
  if (!isAiDraftTitle(plan.title)) return clientFacingPlanTitle(plan.title)

  const meta = parsePlanMeta(plan)
  if (meta.source === 'client_plan_change' || /client request/i.test(plan.title ?? '')) {
    return isUpdate ? 'Updated Plan' : 'Coaching Plan'
  }
  const week = meta.week ?? extractWeekFromTitle(plan.title)
  if (week) {
    return isUpdate ? `Week ${week} Updated Plan` : `Week ${week} Plan`
  }

  return clientFacingPlanTitle(plan.title)
}

/** Never show internal AI draft wording on client surfaces. */
export function clientFacingPlanTitle(title: string | null | undefined): string {
  const raw = (title ?? '').trim()
  if (!raw) return 'Coaching Plan'

  let cleaned = raw
    .replace(/^AI Draft\s*·\s*/i, '')
    .replace(/^AI\s+/i, '')
    .replace(/\bAI\b/gi, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()

  cleaned = cleaned.replace(/\(\s*Draft\s*\)\s*$/i, '').trim()

  cleaned = cleaned
    .replace(/\b12[\s-]*months?\b/gi, 'Build Your Dream Physique')
    .replace(/\b6[\s-]*months?\b/gi, 'Get Lean & Strong')
    .replace(/\b3[\s-]*months?\b/gi, 'Fat loss')
    .replace(/\b90[\s-]*days?\b/gi, 'Fat loss')
    .replace(/\bDebloat\b/gi, 'Fat loss')
    .replace(/\bReduce bloating\b/gi, 'Fat loss')
    .replace(/\bLook sharper\b/gi, 'Fat loss')
    .replace(/\bBuild Your Dream Body\b/gi, 'Build Your Dream Physique')
    .replace(/\bGet Lean & Toned\b/gi, 'Get Lean & Strong')
    .replace(/\bFat loss \+ muscle(?! gain)\b/gi, 'Get Lean & Strong')
    .replace(/\bFat loss \+ muscle gain\b/gi, 'Get Lean & Strong')

  return cleaned || 'Coaching Plan'
}

export type PlanVersionStatus = 'Active' | 'AI Draft' | 'Archived' | 'Draft'

export function getPlanVersionStatus(plan: Plan): PlanVersionStatus {
  if (plan.active) return 'Active'
  if (isAiDraftTitle(plan.title)) return 'AI Draft'
  if (plan.delivered_at) return 'Archived'
  return 'Draft'
}

export function formatGeneratedFrom(meta: PlanMeta, plan: Plan): string {
  if (meta.source) return meta.source
  if (meta.week) return `Week ${meta.week} Check-in`
  if (isAiDraftTitle(plan.title)) return clientFacingPlanTitle(plan.title)
  return 'Manual edit'
}

export function formatGeneratedBy(meta: PlanMeta): string {
  return meta.generatedBy === 'ai' ? 'AI Draft' : 'Coach'
}
