'use client'

import {
  ChipSelector,
  ProgressBar,
  trackerInputStyle,
} from '@/components/tracker/TrackerPrimitives'
import { colors, spacing } from '@/lib/design-tokens'
import { qualityLabelToScore } from '@/lib/daily-tracker/display'
import type {
  SleepQualityLabel,
  TrackerCompletion,
  TrackerSleepItem,
  WakeFeeling,
} from '@/lib/daily-tracker/types'

const QUALITY: { value: SleepQualityLabel; label: string }[] = [
  { value: 'excellent', label: 'Excellent' },
  { value: 'good', label: 'Good' },
  { value: 'average', label: 'Average' },
  { value: 'poor', label: 'Poor' },
]

const WAKE: { value: WakeFeeling; label: string }[] = [
  { value: 'fresh', label: 'Fresh' },
  { value: 'okay', label: 'Okay' },
  { value: 'tired', label: 'Tired' },
]

const MAX_SLEEP_HOURS = 14

type Props = {
  sleep: TrackerSleepItem
  completion: TrackerCompletion
  sleepScore: number
  saving: boolean
  onPatch: (patch: TrackerCompletion) => Promise<boolean>
}

export function SleepModule({ sleep, completion, sleepScore, onPatch }: Props) {
  const data = completion.sleep ?? {}
  const goal = sleep.targetHours ?? 8
  const percent = sleepScore
  const energySet = data.energy != null

  const patch = (next: Partial<typeof data>) => void onPatch({ sleep: next })

  return (
    <div>
      <div style={{ marginBottom: spacing[4] }}>
        <ProgressBar percent={percent} height={10} />
        <div style={{ textAlign: 'right', fontSize: 13, color: colors.accent, fontWeight: 700, marginTop: 6 }}>
          {percent}%
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: spacing[4] }}>
        <div style={{ padding: spacing[3], borderRadius: 14, background: colors.bgElevated, border: `1px solid ${colors.borderSubtle}` }}>
          <div style={{ fontSize: 11, color: colors.textMuted, textTransform: 'uppercase' }}>Sleep Goal</div>
          <div style={{ fontSize: 28, fontWeight: 800, marginTop: 8 }}>{goal}h</div>
          {sleep.targetBedtime && (
            <div style={{ fontSize: 12, color: colors.textMuted, marginTop: 4 }}>Bed by {sleep.targetBedtime}</div>
          )}
        </div>
        <div style={{ padding: spacing[3], borderRadius: 14, background: colors.bgElevated, border: `1px solid ${colors.borderSubtle}` }}>
          <div style={{ fontSize: 11, color: colors.textMuted, textTransform: 'uppercase' }}>Actual Sleep</div>
          <input
            type="number"
            step={0.5}
            min={0}
            max={MAX_SLEEP_HOURS}
            inputMode="decimal"
            placeholder="Hours"
            value={data.hours ?? ''}
            onChange={(e) => {
              const raw = e.target.value
              if (raw === '') {
                patch({ hours: null })
                return
              }
              const parsed = Number(raw)
              if (!Number.isFinite(parsed)) return
              const clamped = Math.max(0, Math.min(MAX_SLEEP_HOURS, parsed))
              patch({ hours: clamped })
            }}
            style={{ ...trackerInputStyle, marginTop: 8, fontSize: 24, fontWeight: 800 }}
          />
        </div>
      </div>

      <label style={{ display: 'block', marginBottom: spacing[3] }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: colors.textSecondary }}>Bed Time</span>
        <input
          placeholder={sleep.targetBedtime ?? '10:30 PM'}
          value={data.bedtime ?? ''}
          onChange={(e) => patch({ bedtime: e.target.value })}
          style={{ ...trackerInputStyle, marginTop: 8 }}
        />
      </label>

      <label style={{ display: 'block', marginBottom: spacing[4] }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: colors.textSecondary }}>Wake Time</span>
        <input
          placeholder="7:00 AM"
          value={data.wakeTime ?? ''}
          onChange={(e) => patch({ wakeTime: e.target.value })}
          style={{ ...trackerInputStyle, marginTop: 8 }}
        />
      </label>

      <div style={{ marginBottom: spacing[4] }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10, color: colors.textSecondary }}>
          Sleep Quality
        </div>
        <ChipSelector
          options={QUALITY}
          value={data.qualityLabel}
          allowClear
          onChange={(v) =>
            patch(
              v
                ? { qualityLabel: v, quality: qualityLabelToScore(v) }
                : { qualityLabel: null, quality: null }
            )
          }
        />
      </div>

      <div style={{ marginBottom: spacing[4] }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10, color: colors.textSecondary }}>
          Energy (1–10)
        </div>
        <input
          type="range"
          min={1}
          max={10}
          value={energySet ? data.energy! : 5}
          onChange={(e) => patch({ energy: Number(e.target.value) })}
          style={{ width: '100%', accentColor: colors.accent, opacity: energySet ? 1 : 0.55 }}
        />
        <div style={{ textAlign: 'center', fontSize: 22, fontWeight: 800, color: colors.accent, marginTop: 8 }}>
          {energySet ? data.energy : '—'}
        </div>
        {!energySet && (
          <p style={{ margin: '6px 0 0', textAlign: 'center', fontSize: 12, color: colors.textMuted }}>
            Move the slider to log energy
          </p>
        )}
      </div>

      <div style={{ marginBottom: spacing[4] }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10, color: colors.textSecondary }}>
          Wake-up feeling
        </div>
        <ChipSelector
          options={WAKE}
          value={data.wakeFeeling}
          allowClear
          onChange={(v) => patch({ wakeFeeling: v })}
        />
      </div>
    </div>
  )
}
