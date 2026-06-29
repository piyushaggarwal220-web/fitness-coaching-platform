'use client'

import type { Plan } from '@/types/database'
import { aiActionStyles as s } from './styles'

type PlanCompareDrawerProps = {
  planA: Plan | null
  planB: Plan | null
  onClose: () => void
}

function CompareBlock({ label, a, b }: { label: string; a: string | null; b: string | null }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <h4 style={{ margin: '0 0 8px 0', fontSize: 14 }}>{label}</h4>
      <div style={{ display: 'flex', gap: 12, flexDirection: 'row' }}>
        <div style={s.compareCol}>
          <div style={{ fontSize: 11, color: '#999', marginBottom: 4 }}>Version A</div>
          <pre style={s.comparePre}>{a?.trim() || '—'}</pre>
        </div>
        <div style={s.compareCol}>
          <div style={{ fontSize: 11, color: '#999', marginBottom: 4 }}>Version B</div>
          <pre style={s.comparePre}>{b?.trim() || '—'}</pre>
        </div>
      </div>
    </div>
  )
}

export function PlanCompareDrawer({ planA, planB, onClose }: PlanCompareDrawerProps) {
  if (!planA || !planB) return null

  return (
    <div style={s.drawerOverlay} onClick={onClose} role="presentation">
      <div style={s.drawer} onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Compare plan versions">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontSize: 18 }}>
            Compare v{planA.version} vs v{planB.version}
          </h3>
          <button type="button" style={s.linkBtn} onClick={onClose}>
            Close
          </button>
        </div>
        <CompareBlock label="Nutrition" a={planA.nutrition_plan} b={planB.nutrition_plan} />
        <CompareBlock label="Workout" a={planA.workout_plan} b={planB.workout_plan} />
        <CompareBlock label="Coach notes" a={planA.coach_notes} b={planB.coach_notes} />
      </div>
    </div>
  )
}
