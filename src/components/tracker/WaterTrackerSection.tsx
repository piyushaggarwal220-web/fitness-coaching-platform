'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { colors, spacing } from '@/lib/design-tokens'
import type { TrackerCompletion, TrackerWaterItem } from '@/lib/daily-tracker/types'

type Props = {
  water: TrackerWaterItem
  completion: TrackerCompletion
  waterScore: number
  saving: boolean
  onPatch: (patch: TrackerCompletion) => Promise<void>
}

const QUICK_ADD = [250, 500, 750, 1000] as const

export function WaterTrackerSection({ water, completion, waterScore, saving, onPatch }: Props) {
  const [customOpen, setCustomOpen] = useState(false)
  const [customMl, setCustomMl] = useState('')
  const currentMl = completion.water?.ml ?? 0
  const percent = Math.min(100, waterScore)
  const fillHeight = Math.max(8, percent)

  const addWater = (ml: number) => {
    void onPatch({ water: { ml: currentMl + ml } })
  }

  return (
    <div style={{ paddingTop: spacing[3] }}>
      <div style={{ display: 'flex', gap: spacing[4], alignItems: 'center', marginBottom: spacing[4] }}>
        <div
          style={{
            width: 72,
            height: 140,
            borderRadius: '12px 12px 20px 20px',
            border: `2px solid ${colors.borderSubtle}`,
            background: colors.bgCard,
            position: 'relative',
            overflow: 'hidden',
            flexShrink: 0,
          }}
        >
          <div
            style={{
              position: 'absolute',
              bottom: 0,
              left: 0,
              right: 0,
              height: `${fillHeight}%`,
              background: `linear-gradient(180deg, rgba(59,130,246,0.9), rgba(37,99,235,0.7))`,
              transition: 'height 600ms cubic-bezier(0.16, 1, 0.3, 1)',
              borderRadius: '0 0 18px 18px',
            }}
          />
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 14,
              fontWeight: 800,
              color: percent > 45 ? '#fff' : colors.textPrimary,
              zIndex: 1,
            }}
          >
            {percent}%
          </div>
        </div>

        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-0.02em' }}>{currentMl.toLocaleString()}</div>
          <div style={{ fontSize: 13, color: colors.textMuted }}>ml consumed today</div>
          <div
            style={{
              marginTop: spacing[2],
              height: 10,
              borderRadius: 999,
              background: colors.bgElevated,
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                height: '100%',
                width: `${percent}%`,
                background: 'linear-gradient(90deg, #3b82f6, #60a5fa)',
                transition: 'width 500ms ease',
              }}
            />
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
        {QUICK_ADD.map((ml) => (
          <Button key={ml} variant="secondary" disabled={saving} onClick={() => addWater(ml)}>
            +{ml >= 1000 ? '1L' : `${ml} ml`}
          </Button>
        ))}
      </div>

      {customOpen ? (
        <div style={{ display: 'flex', gap: 8, marginTop: spacing[3] }}>
          <input
            type="number"
            placeholder="Custom ml"
            value={customMl}
            onChange={(e) => setCustomMl(e.target.value)}
            style={{
              flex: 1,
              padding: '12px 14px',
              borderRadius: 12,
              border: `1px solid ${colors.borderSubtle}`,
              background: colors.bgElevated,
              color: colors.textPrimary,
            }}
          />
          <Button
            disabled={saving || !customMl}
            onClick={() => {
              addWater(Number(customMl) || 0)
              setCustomMl('')
              setCustomOpen(false)
            }}
          >
            Add
          </Button>
        </div>
      ) : (
        <Button variant="ghost" fullWidth disabled={saving} onClick={() => setCustomOpen(true)} style={{ marginTop: spacing[2] }}>
          Custom amount
        </Button>
      )}
    </div>
  )
}
