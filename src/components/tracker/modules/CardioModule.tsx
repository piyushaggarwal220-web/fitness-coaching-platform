'use client'

import { Button } from '@/components/ui/Button'
import { ProgressBar, StatTile, trackerInputStyle } from '@/components/tracker/TrackerPrimitives'
import { colors, radius, spacing } from '@/lib/design-tokens'
import type { TrackerCardioItem, TrackerCompletion } from '@/lib/daily-tracker/types'

type Props = {
  items: TrackerCardioItem[]
  completion: TrackerCompletion
  saving: boolean
  onPatch: (patch: TrackerCompletion) => Promise<void>
}

export function CardioModule({ items, completion, saving, onPatch }: Props) {
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
              padding: spacing[4],
              borderRadius: radius.lg,
              background: colors.bgElevated,
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
              <StatTile label={unit === 'min' ? 'Time' : 'Distance'} value={`${actual} ${unit}`} />
              <StatTile label="Target" value={`${item.target} ${unit}`} />
              <StatTile label="Calories" value={unit === 'min' ? `~${Math.round(actual * 8)}` : '—'} />
            </div>

            <input
              type="number"
              placeholder={`Log ${unit}`}
              value={actual || ''}
              disabled={saving}
              onChange={(e) => {
                const val = Number(e.target.value) || 0
                void onPatch({ cardio: { [item.id]: { actual: val, completed: val >= target } } })
              }}
              style={{ ...trackerInputStyle, marginBottom: spacing[3] }}
            />

            <Button
              fullWidth
              variant={isDone ? 'secondary' : 'primary'}
              success={isDone}
              disabled={saving || actual <= 0}
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
