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

export function StepsModule({ steps, completion, saving, onPatch }: Props) {
  const [editing, setEditing] = useState(false)
  const actual = completion.cardio?.[steps.id]?.actual ?? 0
  const target = Number(steps.target) || 10000
  const percent = getStepsScore(steps, completion)

  const add = (n: number) =>
    void onPatch({
      cardio: { [steps.id]: { actual: actual + n, completed: actual + n >= target } },
    })

  return (
    <div>
      <div style={{ textAlign: 'center', marginBottom: spacing[4] }}>
        <div style={{ fontSize: 'clamp(2.5rem, 10vw, 3.5rem)', fontWeight: 800, letterSpacing: '-0.03em' }}>
          {actual.toLocaleString()}
        </div>
        <div style={{ fontSize: 15, color: colors.textMuted, marginTop: 6 }}>
          of {target.toLocaleString()} steps
        </div>
      </div>

      <ProgressBar percent={percent} height={14} />

      <div style={{ display: 'flex', gap: 10, marginTop: spacing[5] }}>
        {[500, 1000].map((n) => (
          <Button key={n} variant="secondary" fullWidth disabled={saving} onClick={() => add(n)}>
            +{n.toLocaleString()}
          </Button>
        ))}
      </div>

      <Button variant="ghost" fullWidth disabled={saving} onClick={() => setEditing((v) => !v)} style={{ marginTop: 10 }}>
        {editing ? 'Done' : 'Custom'}
      </Button>

      {editing && (
        <input
          type="number"
          value={actual || ''}
          disabled={saving}
          onChange={(e) => {
            const val = Number(e.target.value) || 0
            void onPatch({ cardio: { [steps.id]: { actual: val, completed: val >= target } } })
          }}
          style={{ ...trackerInputStyle, marginTop: spacing[3] }}
        />
      )}

      <p style={{ marginTop: spacing[4], fontSize: 12, color: colors.textMuted, textAlign: 'center' }}>
        Wearable sync coming soon
      </p>
    </div>
  )
}
