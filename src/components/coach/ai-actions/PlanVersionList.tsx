'use client'

import { formatPlanDate } from '@/lib/plans'
import type { Plan } from '@/types/database'
import { useRouter } from 'next/navigation'
import { colors } from '@/lib/coach-theme'
import { aiActionStyles as s } from './styles'

type PlanVersionListProps = {
  plans: Plan[]
  onCompare: (a: Plan, b: Plan) => void
  onRestore: (plan: Plan) => void
  restoringId: string | null
}

function statusBadge(plan: Plan) {
  if (plan.active) return { label: 'Active', style: s.badgeActive }
  const isDraft = !plan.delivered_at
  return isDraft ? { label: 'Draft', style: s.badgeDraft } : { label: 'Archived', style: s.badgeArchived }
}

export function PlanVersionList({ plans, onCompare, onRestore, restoringId }: PlanVersionListProps) {
  const router = useRouter()

  if (plans.length === 0) {
    return <p style={{ color: colors.textMuted, fontSize: 14, margin: 0 }}>No plan versions yet.</p>
  }

  return (
    <div>
      {plans.map((plan) => {
        const badge = statusBadge(plan)
        return (
          <div key={plan.id} style={s.versionRow}>
            <div style={s.versionMeta}>
              <span style={s.versionTitle}>
                Version {plan.version} · {plan.title}
              </span>
              <span style={s.versionDate}>{formatPlanDate(plan.updated_at)}</span>
              <span style={{ ...s.badge, ...badge.style, alignSelf: 'flex-start' }}>{badge.label}</span>
            </div>
            <div style={s.rowActions}>
              <button type="button" style={s.linkBtn} onClick={() => router.push(`/coach/plan/${plan.id}`)}>
                {plan.active ? 'View' : 'Review'}
              </button>
              {plans.length > 1 && (
                <button
                  type="button"
                  style={s.linkBtn}
                  onClick={() => {
                    const other = plans.find((p) => p.id !== plan.id)
                    if (other) onCompare(plan, other)
                  }}
                >
                  Compare
                </button>
              )}
              {!plan.active && (
                <button
                  type="button"
                  style={s.linkBtn}
                  disabled={restoringId === plan.id}
                  onClick={() => onRestore(plan)}
                >
                  {restoringId === plan.id ? 'Restoring…' : 'Restore as draft'}
                </button>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
