'use client'

import { formatFitnessGoal } from '@/lib/coach-utils'
import { formatPlanDate } from '@/lib/plans'
import type { Plan } from '@/types/database'
import { aiActionStyles as s } from './styles'

type ClientContextCardProps = {
  name: string
  goal: string | null
  activePlan: Plan | null
  latestDraft: Plan | null
}

export function ClientContextCard({ name, goal, activePlan, latestDraft }: ClientContextCardProps) {
  return (
    <div style={s.card}>
      <p style={{ margin: '0 0 8px 0', fontWeight: 600, fontSize: 16 }}>{name}</p>
      <p style={{ margin: 0, fontSize: 14, color: '#666' }}>Goal: {formatFitnessGoal(goal)}</p>
      <p style={{ margin: '8px 0 0 0', fontSize: 13, color: '#666' }}>
        Active plan:{' '}
        {activePlan ? `Version ${activePlan.version} · ${formatPlanDate(activePlan.delivered_at ?? activePlan.updated_at)}` : 'None'}
      </p>
      {latestDraft && !latestDraft.active && (
        <p style={{ margin: '4px 0 0 0', fontSize: 13, color: '#004085' }}>
          Latest draft: Version {latestDraft.version} · awaiting review
        </p>
      )}
    </div>
  )
}
