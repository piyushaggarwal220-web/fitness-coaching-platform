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

export function CardioTrackerSection({ items, completion, saving, onPatch }: Props) {
  if (items.length === 0) return null

  return (
    <div style={{ paddingTop: spacing[3] }}>
      {items.map((item) => {
        const actual = completion.cardio?.[item.id]?.actual ?? 0
        const target = Number(item.target) || 1
        const percent = Math.min(100, Math.round((actual / target) * 100))
        const isDone = Boolean(completion.cardio?.[item.id]?.completed)
        const unitLabel = item.unit === 'min' ? 'min' : item.unit

        return (
          <div
            key={item.id}
            style={{
              padding: spacing[3],
              borderRadius: radius.md,
              background: colors.bgElevated,
              border: `1px solid ${colors.borderSubtle}`,
              marginBottom: 12,
            }}
          >
            <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4 }}>{item.activity}</div>
            <div style={{ fontSize: 13, color: colors.textMuted, marginBottom: spacing[3] }}>
              Target: {item.target} {unitLabel}
            </div>

            <div style={{ marginBottom: spacing[3] }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 13 }}>
                <span style={{ color: colors.textMuted }}>Progress</span>
                <span style={{ fontWeight: 700, color: colors.accent }}>{percent}%</span>
              </div>
              <ProgressBar percent={percent} />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: spacing[3] }}>
              <StatTile
                label={item.unit === 'min' ? 'Time' : 'Distance'}
                value={`${actual}${unitLabel === 'min' ? ' min' : ` ${unitLabel}`}`}
              />
              <StatTile label="Target" value={`${item.target} ${unitLabel}`} />
              <StatTile label="Calories" value={item.unit === 'min' ? `~${Math.round(actual * 8)}` : '—'} />
            </div>

            <input
              type="number"
              placeholder={`Log ${unitLabel}`}
              value={actual || ''}
              disabled={saving}
              onChange={(e) => {
                const val = Number(e.target.value) || 0
                void onPatch({
                  cardio: {
                    [item.id]: { actual: val, completed: val >= target },
                  },
                })
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
                  cardio: {
                    [item.id]: { actual: actual || target, completed: !isDone },
                  },
                })
              }
            >
              {isDone ? 'Completed' : 'Complete Cardio'}
            </Button>
          </div>
        )
      })}
    </div>
  )
}
