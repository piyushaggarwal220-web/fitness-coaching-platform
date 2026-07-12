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
