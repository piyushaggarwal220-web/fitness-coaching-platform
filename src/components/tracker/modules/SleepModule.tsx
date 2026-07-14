'use client'

import { Button } from '@/components/ui/Button'
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

type Props = {
  sleep: TrackerSleepItem
  completion: TrackerCompletion
  sleepScore: number
  saving: boolean
  onPatch: (patch: TrackerCompletion) => Promise<void>
}

export function SleepModule({ sleep, completion, sleepScore, saving, onPatch }: Props) {
  const data = completion.sleep ?? {}
  const goal = sleep.targetHours ?? 8
  const percent = sleepScore

  const patch = (next: typeof data) => void onPatch({ sleep: { ...data, ...next } })

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
        </div>
        <div style={{ padding: spacing[3], borderRadius: 14, background: colors.bgElevated, border: `1px solid ${colors.borderSubtle}` }}>
          <div style={{ fontSize: 11, color: colors.textMuted, textTransform: 'uppercase' }}>Actual Sleep</div>
          <input
            type="number"
            step={0.5}
            placeholder="Hours"
            value={data.hours ?? ''}
            disabled={saving}
            onChange={(e) => patch({ hours: Number(e.target.value) || undefined })}
            style={{ ...trackerInputStyle, marginTop: 8, fontSize: 24, fontWeight: 800 }}
          />
        </div>
      </div>

      <label style={{ display: 'block', marginBottom: spacing[3] }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: colors.textSecondary }}>Bed Time</span>
        <input
          placeholder={sleep.targetBedtime ?? '10:30 PM'}
          value={data.bedtime ?? ''}
          disabled={saving}
          onChange={(e) => patch({ bedtime: e.target.value })}
          style={{ ...trackerInputStyle, marginTop: 8 }}
        />
      </label>

      <label style={{ display: 'block', marginBottom: spacing[4] }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: colors.textSecondary }}>Wake Time</span>
        <input
          placeholder="7:00 AM"
          value={data.wakeTime ?? ''}
          disabled={saving}
          onChange={(e) => patch({ wakeTime: e.target.value })}
          style={{ ...trackerInputStyle, marginTop: 8 }}
        />
      </label>

      <div style={{ marginBottom: spacing[4] }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10, color: colors.textSecondary }}>Sleep Quality</div>
        <ChipSelector
          options={QUALITY}
          value={data.qualityLabel}
          disabled={saving}
          onChange={(v) => patch({ qualityLabel: v, quality: qualityLabelToScore(v) })}
        />
      </div>

      <div style={{ marginBottom: spacing[4] }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10, color: colors.textSecondary }}>Energy (1–10)</div>
        <input
          type="range"
          min={1}
          max={10}
          value={data.energy ?? 5}
          disabled={saving}
          onChange={(e) => patch({ energy: Number(e.target.value) })}
          style={{ width: '100%', accentColor: colors.accent }}
        />
        <div style={{ textAlign: 'center', fontSize: 22, fontWeight: 800, color: colors.accent, marginTop: 8 }}>
          {data.energy ?? 5}
        </div>
      </div>

      <div style={{ marginBottom: spacing[4] }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10, color: colors.textSecondary }}>Wake-up feeling</div>
        <ChipSelector options={WAKE} value={data.wakeFeeling} disabled={saving} onChange={(v) => patch({ wakeFeeling: v })} />
      </div>
    </div>
  )
}
