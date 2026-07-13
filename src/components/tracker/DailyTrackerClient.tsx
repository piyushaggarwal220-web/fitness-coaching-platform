'use client'

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react'
import { ClientShell } from '@/components/ui/ClientShell'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { ProgressRing } from '@/components/tracker/ProgressRing'
import { colors, spacing } from '@/lib/design-tokens'
import { getTimelineProgress, isItemComplete } from '@/lib/daily-tracker/scores'
import type {
  DailyTrackerDay,
  ExerciseSetLog,
  TodayTrackerView,
  TrackerCompletion,
  TrackerSnapshotItem,
} from '@/lib/daily-tracker/types'
import { ClipboardList } from 'lucide-react'
import { useRouter } from 'next/navigation'

const PERIOD_LABELS: Record<string, string> = {
  morning: '☀️ Morning',
  lunch: '🥗 Lunch',
  afternoon: '☀️ Afternoon',
  workout: '🏋 Workout',
  evening: '🌆 Evening',
  night: '🌙 Night',
}

type Props = {
  initialView: TodayTrackerView | null
  initialError: string | null
}

export function DailyTrackerClient({ initialView, initialError }: Props) {
  const router = useRouter()
  const [view, setView] = useState(initialView)
  const [error, setError] = useState(initialError ?? '')
  const [saving, setSaving] = useState(false)
  const [encouragement, setEncouragement] = useState('')

  const day = view?.day ?? null

  const timelineProgress = useMemo(() => {
    if (!day) return 0
    return getTimelineProgress(day.snapshot, day.completion)
  }, [day])

  const grouped = useMemo(() => {
    if (!day) return []
    const map = new Map<string, TrackerSnapshotItem[]>()
    for (const item of day.snapshot.items) {
      const key = item.period
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(item)
    }
    return Array.from(map.entries())
  }, [day])

  const patchCompletion = useCallback(
    async (patch: TrackerCompletion) => {
      if (!day) return
      setSaving(true)
      try {
        const res = await fetch('/api/tracker/update', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ dayId: day.id, completion: patch }),
        })
        const data = (await res.json()) as { day?: DailyTrackerDay; error?: string }
        if (!res.ok || !data.day) {
          setError(data.error ?? 'Failed to save progress')
          return
        }
        setView((current) =>
          current ? { ...current, day: data.day! } : current
        )
        const overall = data.day.overall_percent ?? 0
        if (overall < 60) {
          setEncouragement('Small steps count — pick one item and finish it next.')
        } else if (overall >= 90) {
          setEncouragement('Excellent consistency today. Keep it up!')
        } else {
          setEncouragement('')
        }
      } finally {
        setSaving(false)
      }
    },
    [day]
  )

  useEffect(() => {
    if (!day) return
    const workout = day.snapshot.items.find((i) => i.type === 'workout')
    if (!workout || workout.type !== 'workout') return
    const allDone = workout.exercises.every((ex) => day.completion.exercises?.[ex.id]?.completed)
    if (allDone && (day.scores?.diet ?? 0) < 80) {
      setEncouragement('Workout complete — consider a protein-rich meal for recovery.')
    }
  }, [day])

  if (error && !day) {
    return (
      <ClientShell title="Today's Tracker">
        <EmptyState
          icon={<ClipboardList size={40} color={colors.accent} />}
          title="Tracker not ready"
          description={error}
          actionLabel="View plan"
          onAction={() => router.push('/plan')}
        />
      </ClientShell>
    )
  }

  if (!view || !day) {
    return <ClientShell title="Today's Tracker" loading />
  }

  const scores = day.scores

  return (
    <ClientShell title="Today's Tracker">
      <div
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 20,
          marginBottom: spacing[4],
          paddingBottom: spacing[3],
          background: 'linear-gradient(180deg, var(--bg-primary) 70%, transparent)',
        }}
      >
        <p style={{ margin: 0, fontSize: 13, color: colors.accent, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
          {view.greeting}
        </p>
        <h1 style={{ margin: '4px 0 0', fontSize: 'clamp(1.5rem, 5vw, 2rem)', fontWeight: 800 }}>Today&apos;s Progress</h1>

        <Card variant="glass" padding={4} style={{ marginTop: spacing[4], marginBottom: 0 }}>
          <div style={{ display: 'flex', gap: spacing[4], alignItems: 'center', flexWrap: 'wrap' }}>
            <ProgressRing percent={day.overall_percent ?? 0} label="Overall" />
            <div style={{ flex: 1, minWidth: 160 }}>
              <div style={{ display: 'grid', gap: 6, fontSize: 13, color: colors.textSecondary }}>
                <div><strong style={{ color: colors.textPrimary }}>Day {view.schedule.coachingDay}</strong> · Week {view.schedule.coachingWeek}</div>
                <div>Plan v{day.plan_version} · {day.snapshot.planTitle}</div>
                {view.schedule.countdownLabel && (
                  <div style={{ color: colors.accent }}>Next check-in: {view.schedule.countdownLabel}</div>
                )}
                {view.streak > 0 && <div>{view.streak}-day adherence streak</div>}
              </div>
            </div>
          </div>

          {scores && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginTop: spacing[4] }}>
              {(
                [
                  ['Diet', scores.diet],
                  ['Workout', scores.workout],
                  ['Water', scores.water],
                  ['Supps', scores.supplements],
                  ['Cardio', scores.cardio],
                  ['Sleep', scores.sleep],
                ] as const
              ).map(([label, value]) => (
                <div key={label} style={{ textAlign: 'center', padding: '8px 4px', borderRadius: 12, background: colors.bgElevated }}>
                  <div style={{ fontSize: 16, fontWeight: 700, color: colors.accent }}>{value}%</div>
                  <div style={{ fontSize: 11, color: colors.textMuted }}>{label}</div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {encouragement && (
        <Card variant="elevated" padding={3} style={{ borderColor: colors.accentMuted }}>
          <p style={{ margin: 0, fontSize: 14, color: colors.textSecondary, lineHeight: 1.5 }}>{encouragement}</p>
        </Card>
      )}

      <div style={{ position: 'relative', paddingLeft: 20, marginTop: spacing[2] }}>
        <div
          style={{
            position: 'absolute',
            left: 7,
            top: 0,
            bottom: 0,
            width: 3,
            borderRadius: 999,
            background: colors.borderSubtle,
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              width: '100%',
              height: `${timelineProgress}%`,
              background: `linear-gradient(180deg, ${colors.accent}, ${colors.accentMuted})`,
              transition: 'height 500ms ease',
            }}
          />
        </div>

        {grouped.map(([period, items], groupIndex) => (
          <section key={period} className={`stagger-${Math.min(groupIndex, 8)}`} style={{ marginBottom: spacing[5] }}>
            <h2 style={{ margin: '0 0 12px', fontSize: 15, fontWeight: 700, color: colors.textPrimary }}>
              {PERIOD_LABELS[period] ?? period}
            </h2>
            {items.map((item, itemIndex) => (
              <TimelineCard
                key={item.id}
                item={item}
                day={day}
                saving={saving}
                active={!isItemComplete(item, day.completion)}
                staggerIndex={groupIndex * 3 + itemIndex}
                onPatch={patchCompletion}
              />
            ))}
          </section>
        ))}
      </div>
    </ClientShell>
  )
}

function TimelineCard({
  item,
  day,
  saving,
  active,
  staggerIndex,
  onPatch,
}: {
  item: TrackerSnapshotItem
  day: DailyTrackerDay
  saving: boolean
  active: boolean
  staggerIndex: number
  onPatch: (patch: TrackerCompletion) => Promise<void>
}) {
  const completion = day.completion

  return (
    <Card
      variant="glass"
      padding={4}
      staggerIndex={staggerIndex}
      style={{
        marginLeft: spacing[3],
        borderColor: active ? colors.accentMuted : colors.borderSubtle,
        boxShadow: active ? `0 0 0 1px ${colors.accentMuted}` : undefined,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: spacing[2] }}>
        <span style={{ fontSize: 20 }}>{item.icon}</span>
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>{item.title}</h3>
      </div>

      {item.type === 'meal' && (
        <>
          <p style={{ margin: '0 0 12px', fontSize: 14, color: colors.textSecondary, whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
            {item.foods}
          </p>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={Boolean(completion.meals?.[item.id]?.completed)}
              disabled={saving}
              onChange={(e) =>
                void onPatch({
                  meals: { [item.id]: { completed: e.target.checked, notes: completion.meals?.[item.id]?.notes } },
                })
              }
            />
            Mark meal complete
          </label>
        </>
      )}

      {item.type === 'workout' &&
        item.exercises.map((ex) => {
          const exData = completion.exercises?.[ex.id]
          const sets: ExerciseSetLog[] =
            exData?.sets ?? Array.from({ length: ex.targetSets }, () => ({} as ExerciseSetLog))
          return (
            <div key={ex.id} style={{ marginBottom: spacing[3], paddingBottom: spacing[3], borderBottom: `1px solid ${colors.borderSubtle}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start' }}>
                <div>
                  <p style={{ margin: 0, fontWeight: 600, fontSize: 15 }}>{ex.name}</p>
                  <p style={{ margin: '4px 0 0', fontSize: 13, color: colors.textMuted }}>
                    Target: {ex.targetSets} × {ex.targetReps}
                    {ex.targetWeight ? ` @ ${ex.targetWeight}` : ''}
                  </p>
                  {ex.isPr && (
                    <span style={{ fontSize: 11, color: colors.accent, fontWeight: 700 }}>PR</span>
                  )}
                </div>
                <input
                  type="checkbox"
                  checked={Boolean(exData?.completed)}
                  disabled={saving}
                  onChange={(e) =>
                    void onPatch({
                      exercises: {
                        [ex.id]: {
                          completed: e.target.checked,
                          sets,
                          notes: exData?.notes,
                        },
                      },
                    })
                  }
                />
              </div>
              <div style={{ display: 'grid', gap: 6, marginTop: 8 }}>
                {sets.map((set, idx) => (
                  <div key={idx} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
                    <input
                      placeholder="Reps"
                      type="number"
                      value={set.reps ?? ''}
                      disabled={saving}
                      onChange={(e) => {
                        const next = [...sets]
                        next[idx] = { ...next[idx], reps: Number(e.target.value) || undefined }
                        void onPatch({ exercises: { [ex.id]: { completed: exData?.completed ?? false, sets: next } } })
                      }}
                      style={inputStyle}
                    />
                    <input
                      placeholder="kg"
                      type="number"
                      value={set.weight ?? ''}
                      disabled={saving}
                      onChange={(e) => {
                        const next = [...sets]
                        next[idx] = { ...next[idx], weight: Number(e.target.value) || undefined }
                        void onPatch({ exercises: { [ex.id]: { completed: exData?.completed ?? false, sets: next } } })
                      }}
                      style={inputStyle}
                    />
                    <input
                      placeholder="RPE"
                      type="number"
                      min={1}
                      max={10}
                      value={set.rpe ?? ''}
                      disabled={saving}
                      onChange={(e) => {
                        const next = [...sets]
                        next[idx] = { ...next[idx], rpe: Number(e.target.value) || undefined }
                        void onPatch({ exercises: { [ex.id]: { completed: exData?.completed ?? false, sets: next } } })
                      }}
                      style={inputStyle}
                    />
                  </div>
                ))}
              </div>
            </div>
          )
        })}

      {item.type === 'cardio' && (
        <>
          <p style={{ margin: '0 0 8px', fontSize: 14, color: colors.textSecondary }}>
            Target: {item.target} {item.unit}
          </p>
          <input
            type="number"
            placeholder={`Actual ${item.unit}`}
            value={completion.cardio?.[item.id]?.actual ?? ''}
            disabled={saving}
            onChange={(e) =>
              void onPatch({
                cardio: {
                  [item.id]: {
                    actual: Number(e.target.value) || 0,
                    completed: Number(e.target.value) > 0,
                  },
                },
              })
            }
            style={{ ...inputStyle, width: '100%', marginBottom: 8 }}
          />
        </>
      )}

      {item.type === 'supplement' && (
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={Boolean(completion.supplements?.[item.id]?.completed)}
            disabled={saving}
            onChange={(e) =>
              void onPatch({ supplements: { [item.id]: { completed: e.target.checked } } })
            }
          />
          {item.dose ? `Taken · ${item.dose}` : 'Taken'}
        </label>
      )}

      {item.type === 'water' && (
        <>
          <p style={{ margin: '0 0 8px', fontSize: 14, color: colors.textSecondary }}>
            {(completion.water?.ml ?? 0).toLocaleString()} / {item.targetMl.toLocaleString()} ml
          </p>
          <div
            style={{
              height: 8,
              borderRadius: 999,
              background: colors.bgElevated,
              overflow: 'hidden',
              marginBottom: 12,
            }}
          >
            <div
              style={{
                height: '100%',
                width: `${Math.min(100, ((completion.water?.ml ?? 0) / item.targetMl) * 100)}%`,
                background: `linear-gradient(90deg, ${colors.accent}, ${colors.accentMuted})`,
                transition: 'width 400ms ease',
              }}
            />
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {[250, 500, 1000].map((ml) => (
              <Button
                key={ml}
                variant="secondary"
                disabled={saving}
                onClick={() =>
                  void onPatch({
                    water: { ml: (completion.water?.ml ?? 0) + ml },
                  })
                }
              >
                +{ml >= 1000 ? '1L' : `${ml}ml`}
              </Button>
            ))}
          </div>
        </>
      )}

      {item.type === 'sleep' && (
        <div style={{ display: 'grid', gap: 8 }}>
          <p style={{ margin: 0, fontSize: 13, color: colors.textMuted }}>
            Target: {item.targetBedtime} · {item.targetHours}h
          </p>
          <input
            placeholder="Bedtime"
            value={completion.sleep?.bedtime ?? ''}
            disabled={saving}
            onChange={(e) => void onPatch({ sleep: { ...completion.sleep, bedtime: e.target.value } })}
            style={inputStyle}
          />
          <input
            type="number"
            step={0.5}
            placeholder="Hours slept"
            value={completion.sleep?.hours ?? ''}
            disabled={saving}
            onChange={(e) =>
              void onPatch({ sleep: { ...completion.sleep, hours: Number(e.target.value) || undefined } })
            }
            style={inputStyle}
          />
          <input
            type="number"
            min={1}
            max={10}
            placeholder="Sleep quality (1-10)"
            value={completion.sleep?.quality ?? ''}
            disabled={saving}
            onChange={(e) =>
              void onPatch({ sleep: { ...completion.sleep, quality: Number(e.target.value) || undefined } })
            }
            style={inputStyle}
          />
        </div>
      )}

      {item.type === 'note' && (
        <p style={{ margin: 0, fontSize: 14, color: colors.textSecondary, whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
          {item.body}
        </p>
      )}
    </Card>
  )
}

const inputStyle: CSSProperties = {
  padding: '10px 12px',
  borderRadius: 10,
  border: `1px solid ${colors.borderSubtle}`,
  background: colors.bgElevated,
  color: colors.textPrimary,
  fontSize: 14,
}
