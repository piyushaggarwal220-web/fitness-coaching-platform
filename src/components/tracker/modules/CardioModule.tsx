'use client'

import { SetLogField } from '@/components/tracker/SetLogField'
import { Button } from '@/components/ui/Button'
import {
  ProgressBar,
  StatTile,
  trackerSurface,
} from '@/components/tracker/TrackerPrimitives'
import { colors, radius, spacing } from '@/lib/design-tokens'
import type { TrackerCardioItem, TrackerCompletion } from '@/lib/daily-tracker/types'

type Props = {
  items: TrackerCardioItem[]
  completion: TrackerCompletion
  saving: boolean
  onPatch: (patch: TrackerCompletion) => Promise<boolean>
}

export function CardioModule({ items, completion, onPatch }: Props) {
  return (
    <div>
      {items.map((item) => {
        const actual = completion.cardio?.[item.id]?.actual ?? 0
        const target = Number(item.target) || 1
        const percent = Math.min(100, Math.round((actual / target) * 100))
        const isDone = Boolean(completion.cardio?.[item.id]?.completed)
        const unit = item.unit === 'min' ? 'min' : item.unit

        return (
          <div
            key={item.id}
            style={{
              ...trackerSurface,
              padding: spacing[4],
              borderRadius: radius.lg,
              border: `1px solid ${isDone ? 'rgba(34,197,94,0.2)' : colors.borderSubtle}`,
              marginBottom: spacing[4],
            }}
          >
            <div style={{ fontSize: 11, color: colors.accent, fontWeight: 700, textTransform: 'uppercase' }}>
              Today&apos;s Cardio
            </div>
            <div style={{ fontSize: 22, fontWeight: 800, marginTop: 6 }}>{item.activity}</div>
            <div style={{ fontSize: 14, color: colors.textMuted, marginTop: 4 }}>
              Target {item.target} {unit}
            </div>

            <div style={{ margin: `${spacing[4]}px 0` }}>
              <ProgressBar percent={percent} height={10} />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: spacing[4] }}>
              <StatTile
                label={unit === 'min' ? 'Time' : unit === 'steps' ? 'Steps' : 'Distance'}
                value={`${actual} ${unit}`}
              />
              <StatTile label="Target" value={`${item.target} ${unit}`} />
              <StatTile label="Calories" value={unit === 'min' ? `~${Math.round(actual * 8)}` : '—'} />
            </div>

            <div style={{ marginBottom: spacing[3] }}>
            <SetLogField
              aria-label={`Log ${unit}`}
              placeholder={`Log ${unit}`}
              value={actual || null}
              inputMode="decimal"
              onCommit={(val) => {
                const next = val ?? 0
                void onPatch({ cardio: { [item.id]: { actual: next, completed: next >= target } } })
              }}
            />
            </div>

            <Button
              fullWidth
              variant={isDone ? 'secondary' : 'primary'}
              success={isDone}
              disabled={actual <= 0}
              onClick={() =>
                void onPatch({
                  cardio: { [item.id]: { actual: actual || target, completed: !isDone } },
                })
              }
            >
              {isDone ? 'Session Complete' : 'Complete'}
            </Button>
          </div>
        )
      })}
    </div>
  )
}
