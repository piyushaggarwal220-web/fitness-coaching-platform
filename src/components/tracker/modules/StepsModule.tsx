'use client'

import { useRef, useState } from 'react'
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

export function StepsModule({ steps, completion, onPatch }: Props) {
  const [editing, setEditing] = useState(false)
  const initialActual = completion.cardio?.[steps.id]?.actual ?? 0
  const [actual, setActual] = useState(initialActual)
  const actualRef = useRef(initialActual)
  const target = Number(steps.target) || 10000
  const percent = getStepsScore(steps, {
    ...completion,
    cardio: {
      ...completion.cardio,
      [steps.id]: { actual, completed: actual >= target },
    },
  })

  const saveActual = (nextActual: number) => {
    actualRef.current = nextActual
    setActual(nextActual)
    void onPatch({
      cardio: { [steps.id]: { actual: nextActual, completed: nextActual >= target } },
    })
  }

  const add = (n: number) => saveActual(actualRef.current + n)

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
          <Button key={n} variant="secondary" fullWidth onClick={() => add(n)}>
            +{n.toLocaleString()}
          </Button>
        ))}
      </div>

      <Button variant="ghost" fullWidth onClick={() => setEditing((v) => !v)} style={{ marginTop: 10 }}>
        {editing ? 'Done' : 'Custom'}
      </Button>

      {editing && (
        <input
          type="number"
          value={actual || ''}
          onChange={(e) => {
            const val = Number(e.target.value) || 0
            saveActual(val)
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
