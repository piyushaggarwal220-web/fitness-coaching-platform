'use client'

import { useEffect, useState } from 'react'
import { Check } from 'lucide-react'
import {
  ProgressBar,
  StatTile,
  TrackerPhaseFolder,
  trackerInputStyle,
} from '@/components/tracker/TrackerPrimitives'
import { colors, radius, spacing } from '@/lib/design-tokens'
import {
  buildExercisePatch,
  getCurrentExercise,
  getExerciseSets,
} from '@/lib/daily-tracker/exercise-utils'
import {
  computeWorkoutVolume,
  estimateRemainingMinutes,
  getPhaseProgress,
  getWorkoutProgress,
} from '@/lib/daily-tracker/display'
import type { ExerciseSetLog, TrackerCompletion, TrackerWorkoutItem } from '@/lib/daily-tracker/types'

type Props = {
  workout: TrackerWorkoutItem
  completion: TrackerCompletion
  workoutScore: number
  saving: boolean
  onPatch: (patch: TrackerCompletion) => Promise<void>
}

export function WorkoutModule({ workout, completion, workoutScore, saving, onPatch }: Props) {
  const [startedAt, setStartedAt] = useState<number | null>(null)
  const [elapsed, setElapsed] = useState(0)

  const progress = getWorkoutProgress(workout, completion)
  const volume = computeWorkoutVolume(completion)
  const remainingMin = estimateRemainingMinutes(workout, completion)
  const currentEx = getCurrentExercise(workout.exercises, completion.exercises)
  const sessionTitle = [workout.dayLabel, workout.focus].filter(Boolean).join(' · ')

  useEffect(() => {
    const anyLogged = workout.exercises.some((ex) => {
      const sets = completion.exercises?.[ex.id]?.sets ?? []
      return sets.some((s) => s.completed || s.reps != null)
    })
    if (anyLogged && !startedAt) setStartedAt(Date.now())
  }, [completion.exercises, workout.exercises, startedAt])

  useEffect(() => {
    if (!startedAt || progress.percent >= 100) return
    const id = window.setInterval(() => setElapsed(Math.floor((Date.now() - startedAt) / 1000)), 1000)
    return () => window.clearInterval(id)
  }, [startedAt, progress.percent])

  const formatDuration = (seconds: number) => {
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return `${m}:${s.toString().padStart(2, '0')}`
  }

  const updateSet = (exId: string, ex: typeof workout.exercises[0], setIdx: number, patch: Partial<ExerciseSetLog>) => {
    const data = completion.exercises?.[exId]
    const sets = getExerciseSets(ex, data)
    const next = [...sets]
    next[setIdx] = { ...next[setIdx], ...patch }
    void onPatch({ exercises: { [exId]: buildExercisePatch(ex, data, next) } })
  }

  const completeSet = (exId: string, ex: typeof workout.exercises[0], setIdx: number) => {
    const data = completion.exercises?.[exId]
    const sets = getExerciseSets(ex, data)
    const next = [...sets]
    next[setIdx] = { ...next[setIdx], completed: true }
    void onPatch({ exercises: { [exId]: buildExercisePatch(ex, data, next) } })
  }

  return (
    <div>
      {sessionTitle && (
        <div
          style={{
            padding: spacing[3],
            borderRadius: radius.md,
            background: `linear-gradient(135deg, ${colors.accentMuted}, transparent)`,
            border: `1px solid ${colors.accentMuted}`,
            marginBottom: spacing[4],
          }}
        >
          <div style={{ fontSize: 11, color: colors.accent, fontWeight: 700, textTransform: 'uppercase' }}>
            Today&apos;s Workout
          </div>
          <div style={{ fontSize: 22, fontWeight: 800, marginTop: 6 }}>{sessionTitle}</div>
        </div>
      )}

      <div style={{ marginBottom: spacing[3] }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 14 }}>
          <span style={{ color: colors.textSecondary }}>{progress.completed} / {progress.total} exercises</span>
          <span style={{ fontWeight: 800, color: colors.accent }}>{workoutScore}%</span>
        </div>
        <ProgressBar percent={workoutScore} height={10} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8, marginBottom: spacing[4] }}>
        <StatTile label="Exercises" value={`${progress.completed}/${progress.total}`} />
        <StatTile label="Est. time" value={remainingMin > 0 ? `${remainingMin} min` : '—'} />
        <StatTile label="Volume" value={volume > 0 ? `${volume.toLocaleString()} kg` : '—'} />
        <StatTile label="Current" value={currentEx?.name?.split(' ').slice(0, 2).join(' ') ?? '—'} />
      </div>

      {startedAt && (
        <div style={{ textAlign: 'center', marginBottom: spacing[4], fontSize: 13, color: colors.textMuted }}>
          Duration {formatDuration(elapsed)}
        </div>
      )}

      {workout.phases.map((block) => (
        <TrackerPhaseFolder
          key={block.id}
          title={block.label}
          subtitle={`${getPhaseProgress(block, completion).completed}/${block.exercises.length} exercises`}
          progress={getPhaseProgress(block, completion).percent}
          defaultOpen={block.phase === 'main' || block.exercises.some((ex) => ex.id === currentEx?.id)}
        >
          {block.exercises.map((ex) => {
            const exData = completion.exercises?.[ex.id]
            const sets = getExerciseSets(ex, exData)
            const isDone = Boolean(exData?.completed)
            const isCurrent = currentEx?.id === ex.id
            const defaultWeight = ex.targetWeight?.replace(/[^\d.]/g, '')

            return (
              <div
                key={ex.id}
                style={{
                  borderRadius: 14,
                  padding: spacing[3],
                  marginBottom: 12,
                  background: isDone ? colors.successMuted : isCurrent ? colors.accentMuted : colors.bgCard,
                  border: `1px solid ${isDone ? 'rgba(34,197,94,0.25)' : isCurrent ? colors.accentMuted : colors.borderSubtle}`,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                  <div>
                    <div style={{ fontWeight: 800, fontSize: 17 }}>{ex.name}</div>
                    <div style={{ fontSize: 13, color: colors.textMuted, marginTop: 4 }}>
                      {ex.targetSets} × {ex.targetReps}
                      {ex.targetWeight ? ` @ ${ex.targetWeight}` : ''}
                    </div>
                  </div>
                  {isDone && <Check size={24} color={colors.success} strokeWidth={3} />}
                </div>

                {sets.map((set, idx) => (
                  <div
                    key={idx}
                    style={{
                      marginTop: 12,
                      padding: 12,
                      borderRadius: 12,
                      background: colors.bgElevated,
                      border: `1px solid ${set.completed ? 'rgba(34,197,94,0.2)' : colors.borderSubtle}`,
                    }}
                  >
                    <div style={{ fontSize: 12, fontWeight: 700, color: colors.textMuted, marginBottom: 8 }}>
                      Set {idx + 1}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 8, alignItems: 'end' }}>
                      <div>
                        <label style={{ fontSize: 10, color: colors.textMuted }}>Weight (kg)</label>
                        <input
                          type="number"
                          placeholder={defaultWeight || '—'}
                          value={set.weight ?? ''}
                          disabled={saving || isDone || set.completed}
                          onChange={(e) => updateSet(ex.id, ex, idx, { weight: Number(e.target.value) || undefined })}
                          style={trackerInputStyle}
                        />
                      </div>
                      <div>
                        <label style={{ fontSize: 10, color: colors.textMuted }}>Reps</label>
                        <input
                          type="number"
                          placeholder={ex.targetReps}
                          value={set.reps ?? ''}
                          disabled={saving || isDone || set.completed}
                          onChange={(e) => updateSet(ex.id, ex, idx, { reps: Number(e.target.value) || undefined })}
                          style={trackerInputStyle}
                        />
                      </div>
                      <button
                        type="button"
                        disabled={saving || isDone || set.completed}
                        onClick={() => completeSet(ex.id, ex, idx)}
                        style={{
                          height: 48,
                          padding: '0 14px',
                          borderRadius: 12,
                          border: 'none',
                          background: set.completed ? colors.successMuted : colors.accent,
                          color: set.completed ? colors.success : colors.textInverse,
                          fontWeight: 700,
                          fontSize: 13,
                          cursor: set.completed ? 'default' : 'pointer',
                        }}
                      >
                        {set.completed ? '✓' : 'Done'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )
          })}
        </TrackerPhaseFolder>
      ))}
    </div>
  )
}
