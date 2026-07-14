'use client'

import { CompletionToggle } from '@/components/tracker/TrackerPrimitives'
import { colors, spacing } from '@/lib/design-tokens'
import type { TrackerCompletion, TrackerSupplementItem } from '@/lib/daily-tracker/types'

const PERIOD_LABELS: Record<string, string> = {
  morning: 'Morning',
  lunch: 'Midday',
  afternoon: 'Afternoon',
  workout: 'Workout',
  evening: 'Evening',
  night: 'Night',
}

type Props = {
  supplements: TrackerSupplementItem[]
  completion: TrackerCompletion
  supplementsScore: number
  saving: boolean
  onPatch: (patch: TrackerCompletion) => Promise<void>
}

export function SupplementsTrackerSection({
  supplements,
  completion,
  saving,
  onPatch,
}: Props) {
  if (supplements.length === 0) return null

  const grouped = supplements.reduce<Record<string, TrackerSupplementItem[]>>((acc, supp) => {
    const key = supp.period
    if (!acc[key]) acc[key] = []
    acc[key]!.push(supp)
    return acc
  }, {})

  return (
    <div style={{ paddingTop: spacing[3] }}>
      {Object.entries(grouped).map(([period, items]) => (
        <div key={period} style={{ marginBottom: spacing[3] }}>
          <div
            style={{
              fontSize: 12,
              fontWeight: 700,
              color: colors.textMuted,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              marginBottom: 10,
            }}
          >
            {PERIOD_LABELS[period] ?? period}
          </div>
          {items.map((supp) => {
            const taken = Boolean(completion.supplements?.[supp.id]?.completed)
            return (
              <div
                key={supp.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '14px 16px',
                  borderRadius: 14,
                  background: taken ? colors.successMuted : colors.bgElevated,
                  border: `1px solid ${taken ? 'rgba(34,197,94,0.2)' : colors.borderSubtle}`,
                  marginBottom: 8,
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 15 }}>{supp.title}</div>
                  {supp.dose && <div style={{ fontSize: 12, color: colors.textMuted, marginTop: 2 }}>{supp.dose}</div>}
                </div>
                <CompletionToggle
                  completed={taken}
                  disabled={saving}
                  label={`Mark ${supp.title} taken`}
                  onToggle={() =>
                    void onPatch({
                      supplements: { [supp.id]: { completed: !taken } },
                    })
                  }
                />
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}
