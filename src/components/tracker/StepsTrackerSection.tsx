'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { ProgressBar, trackerInputStyle } from '@/components/tracker/TrackerPrimitives'
import { colors, spacing } from '@/lib/design-tokens'
import { getStepsScore } from '@/lib/daily-tracker/display'
import type { TrackerCardioItem, TrackerCompletion } from '@/lib/daily-tracker/types'

type Props = {
  steps: TrackerCardioItem
  completion: TrackerCompletion
  saving: boolean
  onPatch: (patch: TrackerCompletion) => Promise<void>
}

export function StepsTrackerSection({ steps, completion, saving, onPatch }: Props) {
  const [editing, setEditing] = useState(false)
  const actual = completion.cardio?.[steps.id]?.actual ?? 0
  const target = Number(steps.target) || 10000
  const percent = getStepsScore(steps, completion)

  const addSteps = (amount: number) => {
    void onPatch({
      cardio: {
        [steps.id]: {
          actual: actual + amount,
          completed: actual + amount >= target,
        },
      },
    })
  }

  return (
    <div style={{ paddingTop: spacing[3] }}>
      <div style={{ textAlign: 'center', marginBottom: spacing[3] }}>
        <div style={{ fontSize: 'clamp(2rem, 8vw, 2.75rem)', fontWeight: 800, letterSpacing: '-0.03em' }}>
          {actual.toLocaleString()}
        </div>
        <div style={{ fontSize: 13, color: colors.textMuted, marginTop: 4 }}>
          of {target.toLocaleString()} goal
        </div>
      </div>

      <ProgressBar percent={percent} height={12} />

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: spacing[4] }}>
        {[500, 1000].map((n) => (
          <Button key={n} variant="secondary" disabled={saving} onClick={() => addSteps(n)} style={{ flex: '1 1 40%' }}>
            +{n.toLocaleString()}
          </Button>
        ))}
        <Button variant="ghost" disabled={saving} onClick={() => setEditing((v) => !v)} style={{ flex: '1 1 40%' }}>
          {editing ? 'Done' : 'Edit'}
        </Button>
      </div>

      {editing && (
        <input
          type="number"
          placeholder="Enter step count"
          value={actual || ''}
          disabled={saving}
          onChange={(e) => {
            const val = Number(e.target.value) || 0
            void onPatch({
              cardio: {
                [steps.id]: { actual: val, completed: val >= target },
              },
            })
          }}
          style={{ ...trackerInputStyle, marginTop: spacing[3] }}
        />
      )}

      <p style={{ margin: `${spacing[3]}px 0 0`, fontSize: 12, color: colors.textMuted, textAlign: 'center' }}>
        Wearable auto-sync coming soon
      </p>
    </div>
  )
}
