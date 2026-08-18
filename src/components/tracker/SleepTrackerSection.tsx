'use client'

import {
  ChipSelector,
  trackerInputStyle,
} from '@/components/tracker/TrackerPrimitives'
import { colors, spacing } from '@/lib/design-tokens'
import { qualityLabelToScore, scoreToQualityLabel } from '@/lib/daily-tracker/display'
import type { SleepQualityLabel, TrackerCompletion, TrackerSleepItem, WakeFeeling } from '@/lib/daily-tracker/types'

type Props = {
  sleep: TrackerSleepItem
  completion: TrackerCompletion
  sleepScore: number
  saving: boolean
  onPatch: (patch: TrackerCompletion) => Promise<boolean>
}

const QUALITY_OPTIONS: { value: SleepQualityLabel; label: string }[] = [
  { value: 'excellent', label: 'Excellent' },
  { value: 'good', label: 'Good' },
  { value: 'average', label: 'Average' },
  { value: 'poor', label: 'Poor' },
]

const WAKE_OPTIONS: { value: WakeFeeling; label: string }[] = [
  { value: 'fresh', label: 'Fresh' },
  { value: 'okay', label: 'Okay' },
  { value: 'tired', label: 'Tired' },
]

const MAX_SLEEP_HOURS = 14

export function SleepTrackerSection({ sleep, completion, sleepScore, saving, onPatch }: Props) {
  const sleepData = completion.sleep ?? {}
  const energySet = sleepData.energy != null
  const qualityLabel =
    sleepData.qualityLabel ??
    (sleepData.quality != null
      ? (['excellent', 'good', 'average', 'poor'] as const).find(
          (k) => qualityLabelToScore(k) === sleepData.quality
        )
      : undefined)

  return (
    <div style={{ paddingTop: spacing[3] }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: spacing[4] }}>
        <div
          style={{
            padding: spacing[3],
            borderRadius: 14,
            background: colors.bgElevated,
            border: `1px solid ${colors.borderSubtle}`,
          }}
        >
          <div style={{ fontSize: 11, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Sleep Goal
          </div>
          <div style={{ fontSize: 22, fontWeight: 800, marginTop: 6 }}>{sleep.targetHours ?? 8}h</div>
          {sleep.targetBedtime && (
            <div style={{ fontSize: 12, color: colors.textMuted, marginTop: 4 }}>Bed by {sleep.targetBedtime}</div>
          )}
        </div>
        <div
          style={{
            padding: spacing[3],
            borderRadius: 14,
            background: colors.bgElevated,
            border: `1px solid ${colors.borderSubtle}`,
          }}
        >
          <div style={{ fontSize: 11, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Actual
          </div>
          <input
            type="number"
            step={0.5}
            min={0}
            max={MAX_SLEEP_HOURS}
            inputMode="decimal"
            placeholder="Hours"
            value={sleepData.hours ?? ''}
            disabled={saving}
            onChange={(e) => {
              const raw = e.target.value
              if (raw === '') {
                void onPatch({ sleep: { hours: null } })
                return
              }
              const parsed = Number(raw)
              if (!Number.isFinite(parsed)) return
              void onPatch({
                sleep: {
                  hours: Math.max(0, Math.min(MAX_SLEEP_HOURS, parsed)),
                },
              })
            }}
            style={{
              ...trackerInputStyle,
              marginTop: 6,
              fontSize: 22,
              fontWeight: 800,
              padding: '8px 10px',
              minHeight: 44,
            }}
          />
        </div>
      </div>

      <div style={{ marginBottom: spacing[4] }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10, color: colors.textSecondary }}>Quality</div>
        <ChipSelector
          options={QUALITY_OPTIONS}
          value={qualityLabel}
          disabled={saving}
          allowClear
          onChange={(v) =>
            void onPatch({
              sleep: v
                ? { qualityLabel: v, quality: qualityLabelToScore(v) }
                : { qualityLabel: null, quality: null },
            })
          }
        />
        {sleepData.quality != null && !qualityLabel && (
          <p style={{ margin: '8px 0 0', fontSize: 12, color: colors.textMuted }}>
            {scoreToQualityLabel(sleepData.quality)}
          </p>
        )}
      </div>

      <div style={{ marginBottom: spacing[4] }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10, color: colors.textSecondary }}>
          Energy (1–10)
        </div>
        <input
          type="range"
          min={1}
          max={10}
          value={energySet ? sleepData.energy! : 5}
          disabled={saving}
          onChange={(e) =>
            void onPatch({
              sleep: {
                energy: Number(e.target.value),
              },
            })
          }
          style={{ width: '100%', accentColor: colors.accent, opacity: energySet ? 1 : 0.55 }}
        />
        <div style={{ textAlign: 'center', fontSize: 20, fontWeight: 800, color: colors.accent, marginTop: 8 }}>
          {energySet ? sleepData.energy : '—'}
        </div>
        {!energySet && (
          <p style={{ margin: '6px 0 0', textAlign: 'center', fontSize: 12, color: colors.textMuted }}>
            Move the slider to log energy
          </p>
        )}
      </div>

      <div>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10, color: colors.textSecondary }}>
          Wake-up feeling
        </div>
        <ChipSelector
          options={WAKE_OPTIONS}
          value={sleepData.wakeFeeling}
          disabled={saving}
          allowClear
          onChange={(v) =>
            void onPatch({
              sleep: {
                wakeFeeling: v,
              },
            })
          }
        />
      </div>

      <p style={{ margin: `${spacing[3]}px 0 0`, fontSize: 12, color: colors.textMuted }}>
        Sleep progress: {sleepScore}%
      </p>
    </div>
  )
}
