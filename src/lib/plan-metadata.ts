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

  const isAi = plan.title.startsWith('AI Draft')
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
  return (title ?? '').trim().startsWith('AI Draft')
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

/** Strip metadata and validate before delivering a plan to the client. */
export function prepareCoachNotesForPublish(notes: string | null | undefined): {
  notes: string | null
  error: string | null
} {
  const cleaned = stripPlanMeta(notes).trim()
  if (!cleaned) {
    return {
      notes: null,
      error: 'Cannot publish: Coach Notes must include a client-facing message.',
    }
  }
  return { notes: cleaned, error: null }
}

export function formatPublishedPlanTitle(
  plan: Pick<Plan, 'title' | 'coach_notes' | 'phase'>,
  isUpdate: boolean
): string {
  if (!isAiDraftTitle(plan.title)) return plan.title.trim()

  const meta = parsePlanMeta(plan)
  const week = meta.week ?? extractWeekFromTitle(plan.title)
  if (week) {
    return isUpdate ? `Week ${week} Updated Plan` : `Week ${week} Plan`
  }

  return plan.title.replace(/^AI Draft\s*·\s*/i, '').trim() || 'Coaching Plan'
}

export type PlanVersionStatus = 'Active' | 'AI Draft' | 'Archived' | 'Draft'

export function getPlanVersionStatus(plan: Plan): PlanVersionStatus {
  if (plan.active) return 'Active'
  if (plan.title.startsWith('AI Draft')) return 'AI Draft'
  if (plan.delivered_at) return 'Archived'
  return 'Draft'
}

export function formatGeneratedFrom(meta: PlanMeta, plan: Plan): string {
  if (meta.source) return meta.source
  if (meta.week) return `Week ${meta.week} Check-in`
  if (plan.title.startsWith('AI Draft')) return plan.title.replace('AI Draft · ', '')
  return 'Manual edit'
}

export function formatGeneratedBy(meta: PlanMeta): string {
  return meta.generatedBy === 'ai' ? 'AI Draft' : 'Coach'
}
