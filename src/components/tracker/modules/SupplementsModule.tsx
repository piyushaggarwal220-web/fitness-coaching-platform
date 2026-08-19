'use client'

import { CompletionToggle, trackerSurface } from '@/components/tracker/TrackerPrimitives'
import { colors, spacing } from '@/lib/design-tokens'
import type { TrackerCompletion, TrackerSupplementItem } from '@/lib/daily-tracker/types'

const PERIOD_LABELS: Record<string, string> = {
  morning: 'Morning',
  lunch: 'Midday',
  afternoon: 'Afternoon',
  evening: 'Evening',
  night: 'Night',
}

type Props = {
  supplements: TrackerSupplementItem[]
  completion: TrackerCompletion
  saving: boolean
  onPatch: (patch: TrackerCompletion) => Promise<boolean>
}

export function SupplementsModule({ supplements, completion, saving, onPatch }: Props) {
  const grouped = supplements.reduce<Record<string, TrackerSupplementItem[]>>((acc, s) => {
    if (!acc[s.period]) acc[s.period] = []
    acc[s.period]!.push(s)
    return acc
  }, {})

  return (
    <div>
      {Object.entries(grouped).map(([period, items]) => (
        <div key={period} style={{ marginBottom: spacing[5] }}>
          <div
            style={{
              fontSize: 12,
              fontWeight: 800,
              color: colors.textMuted,
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
              marginBottom: 12,
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
                  ...trackerSurface,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 14,
                  padding: '16px 18px',
                  borderRadius: 16,
                  ...(taken
                    ? {
                        background:
                          'linear-gradient(135deg, rgba(34,197,94,0.14) 0%, rgba(24,24,27,0.92) 60%)',
                        border: '1px solid rgba(34,197,94,0.24)',
                      }
                    : null),
                  marginBottom: 10,
                }}
              >
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 16 }}>{supp.title}</div>
                  {supp.dose && <div style={{ fontSize: 13, color: colors.textMuted, marginTop: 4 }}>{supp.dose}</div>}
                </div>
                <CompletionToggle
                  completed={taken}
                  disabled={saving}
                  onToggle={() =>
                    void onPatch({ supplements: { [supp.id]: { completed: !taken } } })
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
