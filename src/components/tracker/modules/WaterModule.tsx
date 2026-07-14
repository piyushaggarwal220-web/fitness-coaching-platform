'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { ProgressRing } from '@/components/tracker/ProgressRing'
import { trackerInputStyle } from '@/components/tracker/TrackerPrimitives'
import { colors, spacing } from '@/lib/design-tokens'
import type { TrackerCompletion, TrackerWaterItem } from '@/lib/daily-tracker/types'

const QUICK = [250, 500, 750, 1000] as const

type Props = {
  water: TrackerWaterItem
  completion: TrackerCompletion
  waterScore: number
  saving: boolean
  onPatch: (patch: TrackerCompletion) => Promise<void>
}

export function WaterModule({ water, completion, waterScore, saving, onPatch }: Props) {
  const [customOpen, setCustomOpen] = useState(false)
  const [customMl, setCustomMl] = useState('')
  const currentMl = completion.water?.ml ?? 0
  const percent = Math.min(100, waterScore)

  const add = (ml: number) => void onPatch({ water: { ml: currentMl + ml } })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: spacing[4] }}>
      <ProgressRing percent={percent} size={200} stroke={14} label="Hydration" />
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 36, fontWeight: 800 }}>{currentMl.toLocaleString()} ml</div>
        <div style={{ fontSize: 14, color: colors.textMuted, marginTop: 4 }}>
          Goal {water.targetMl.toLocaleString()} ml
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10, width: '100%' }}>
        {QUICK.map((ml) => (
          <Button key={ml} variant="secondary" disabled={saving} onClick={() => add(ml)}>
            +{ml >= 1000 ? '1 L' : `${ml} ml`}
          </Button>
        ))}
      </div>

      {customOpen ? (
        <div style={{ display: 'flex', gap: 8, width: '100%' }}>
          <input
            type="number"
            placeholder="Custom ml"
            value={customMl}
            onChange={(e) => setCustomMl(e.target.value)}
            style={{ ...trackerInputStyle, flex: 1 }}
          />
          <Button
            disabled={!customMl || saving}
            onClick={() => {
              add(Number(customMl) || 0)
              setCustomMl('')
              setCustomOpen(false)
            }}
          >
            Add
          </Button>
        </div>
      ) : (
        <Button variant="ghost" fullWidth disabled={saving} onClick={() => setCustomOpen(true)}>
          Custom amount
        </Button>
      )}
    </div>
  )
}
