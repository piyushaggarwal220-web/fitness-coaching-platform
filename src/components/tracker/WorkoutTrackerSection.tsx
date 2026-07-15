'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import {
  ProgressBar,
  StatTile,
  TrackerPhaseFolder,
  trackerInputStyle,
} from '@/components/tracker/TrackerPrimitives'
import { colors, radius, spacing } from '@/lib/design-tokens'
import {
  computeWorkoutVolume,
  estimateRemainingMinutes,
  getPhaseProgress,
  getWorkoutProgress,
} from '@/lib/daily-tracker/display'
import {
  buildExercisePatch,
  durationFromParts,
  formatDurationInput,
  formatExerciseTarget,
  inferTrackingMode,
} from '@/lib/daily-tracker/exercise-utils'
import type {
  ExerciseCompletion,
  ExerciseSetLog,
  TrackerCompletion,
  TrackerExerciseItem,
  TrackerWorkoutItem,
  WorkoutPhaseBlock,
} from '@/lib/daily-tracker/types'
import { Check, Clock, Dumbbell } from 'lucide-react'

type Props = {
  workout: TrackerWorkoutItem
  completion: TrackerCompletion
  workoutScore: number
  saving: boolean
  onPatch: (patch: TrackerCompletion) => Promise<void>
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

function ExerciseCard({
  ex,
  exData,
  sets,
  isDone,
  isActive,
  saving,
  onStart,
  onPatch,
}: {
  ex: TrackerExerciseItem
  exData: ExerciseCompletion | undefined
  sets: ExerciseSetLog[]
  isDone: boolean
  isActive: boolean
  saving: boolean
  onStart: () => void
  onPatch: (patch: TrackerCompletion) => Promise<void>
}) {
  const defaultWeight = ex.targetWeight?.replace(/[^\d.]/g, '')

  return (
    <div
      style={{
        borderRadius: 14,
        padding: spacing[3],
        marginBottom: 10,
        background: isDone ? colors.successMuted : colors.bgCard,
        border: `1px solid ${isDone ? 'rgba(34,197,94,0.25)' : isActive ? colors.accentMuted : colors.borderSubtle}`,
      }}
    >
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: 10,
            background: isDone ? 'rgba(34,197,94,0.15)' : colors.accentMuted,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          {isDone ? (
            <Check size={18} color={colors.success} strokeWidth={3} />
          ) : (
            <Dumbbell size={16} color={colors.accent} />
          )}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 800, fontSize: 16, lineHeight: 1.25 }}>{ex.name}</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 6, fontSize: 13, color: colors.textMuted }}>
            <span style={{ fontWeight: 600, color: colors.textSecondary }}>
              {formatExerciseTarget(ex)}
            </span>
            {ex.restSeconds != null && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <Clock size={12} /> {ex.restSeconds}s rest
              </span>
            )}
          </div>
          {ex.notes && (
            <p style={{ margin: '8px 0 0', fontSize: 12, color: colors.textMuted, lineHeight: 1.4 }}>{ex.notes}</p>
          )}
        </div>
      </div>

      {(isActive || isDone) && (
        <div style={{ marginTop: spacing[3] }}>
          {(() => {
            const mode = inferTrackingMode(ex)
            const patchSets = (next: ExerciseSetLog[]) => {
              void onPatch({
                exercises: { [ex.id]: buildExercisePatch(ex, exData, next) },
              })
            }

            if (mode === 'checkoff') {
              return !isDone ? (
                <Button
                  fullWidth
                  disabled={saving}
                  onClick={() => {
                    const next = sets.map((s, i) => (i === 0 ? { ...s, completed: true } : s))
                    patchSets(next)
                  }}
                >
                  Mark complete
                </Button>
              ) : null
            }

            const headers =
              mode === 'timed'
                ? ['Set', 'Min', 'Sec']
                : mode === 'distance'
                  ? ['Set', 'Meters']
                  : mode === 'reps_only'
                    ? ['Set', 'Reps']
                    : ['Set', 'Reps', 'kg', 'RPE']

            return (
              <>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns:
                      mode === 'timed'
                        ? '48px 1fr 1fr'
                        : mode === 'distance' || mode === 'reps_only'
                          ? '48px 1fr'
                          : '48px 1fr 1fr 1fr',
                    gap: 6,
                    marginBottom: 6,
                    fontSize: 10,
                    color: colors.textMuted,
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    paddingLeft: 4,
                  }}
                >
                  {headers.map((h) => (
                    <span key={h}>{h}</span>
                  ))}
                </div>

                {sets.map((set, idx) => {
                  const dur = formatDurationInput(set.durationSeconds)
                  return (
                    <div
                      key={idx}
                      style={{
                        display: 'grid',
                        gridTemplateColumns:
                          mode === 'timed'
                            ? '48px 1fr 1fr'
                            : mode === 'distance' || mode === 'reps_only'
                              ? '48px 1fr'
                              : '48px 1fr 1fr 1fr',
                        gap: 6,
                        marginBottom: 8,
                        alignItems: 'center',
                      }}
                    >
                      <div
                        style={{
                          width: 36,
                          height: 36,
                          borderRadius: 8,
                          background: colors.bgElevated,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontWeight: 700,
                          fontSize: 13,
                        }}
                      >
                        {idx + 1}
                      </div>
                      {mode === 'timed' && (
                        <>
                          <input
                            type="number"
                            value={dur.minutes}
                            disabled={saving || isDone}
                            onChange={(e) => {
                              const next = [...sets]
                              next[idx] = {
                                ...next[idx],
                                durationSeconds: durationFromParts(e.target.value, dur.seconds),
                              }
                              patchSets(next)
                            }}
                            style={{ ...trackerInputStyle, minHeight: 44, padding: '10px 8px' }}
                          />
                          <input
                            type="number"
                            value={dur.seconds}
                            disabled={saving || isDone}
                            onChange={(e) => {
                              const next = [...sets]
                              next[idx] = {
                                ...next[idx],
                                durationSeconds: durationFromParts(dur.minutes, e.target.value),
                              }
                              patchSets(next)
                            }}
                            style={{ ...trackerInputStyle, minHeight: 44, padding: '10px 8px' }}
                          />
                        </>
                      )}
                      {mode === 'distance' && (
                        <input
                          type="number"
                          placeholder={ex.targetDistanceMeters != null ? String(ex.targetDistanceMeters) : '—'}
                          value={set.distanceMeters ?? ''}
                          disabled={saving || isDone}
                          onChange={(e) => {
                            const next = [...sets]
                            next[idx] = { ...next[idx], distanceMeters: Number(e.target.value) || undefined }
                            patchSets(next)
                          }}
                          style={{ ...trackerInputStyle, minHeight: 44, padding: '10px 8px' }}
                        />
                      )}
                      {mode === 'reps_only' && (
                        <input
                          placeholder={ex.targetReps}
                          type="number"
                          value={set.reps ?? ''}
                          disabled={saving || isDone}
                          onChange={(e) => {
                            const next = [...sets]
                            next[idx] = { ...next[idx], reps: Number(e.target.value) || undefined }
                            patchSets(next)
                          }}
                          style={{ ...trackerInputStyle, minHeight: 44, padding: '10px 8px' }}
                        />
                      )}
                      {mode === 'strength' && (
                        <>
                          <input
                            placeholder={ex.targetReps}
                            type="number"
                            value={set.reps ?? ''}
                            disabled={saving || isDone}
                            onChange={(e) => {
                              const next = [...sets]
                              next[idx] = { ...next[idx], reps: Number(e.target.value) || undefined }
                              patchSets(next)
                            }}
                            style={{ ...trackerInputStyle, minHeight: 44, padding: '10px 8px' }}
                          />
                          <input
                            placeholder={defaultWeight || '—'}
                            type="number"
                            value={set.weight ?? ''}
                            disabled={saving || isDone}
                            onChange={(e) => {
                              const next = [...sets]
                              next[idx] = { ...next[idx], weight: Number(e.target.value) || undefined }
                              patchSets(next)
                            }}
                            style={{ ...trackerInputStyle, minHeight: 44, padding: '10px 8px' }}
                          />
                          <input
                            placeholder="—"
                            type="number"
                            min={1}
                            max={10}
                            value={set.rpe ?? ''}
                            disabled={saving || isDone}
                            onChange={(e) => {
                              const next = [...sets]
                              next[idx] = { ...next[idx], rpe: Number(e.target.value) || undefined }
                              patchSets(next)
                            }}
                            style={{ ...trackerInputStyle, minHeight: 44, padding: '10px 8px' }}
                          />
                        </>
                      )}
                    </div>
                  )
                })}

                {!isDone && (
                  <Button
                    fullWidth
                    disabled={saving}
                    onClick={() => {
                      const next = sets.map((s) => ({ ...s, completed: true }))
                      patchSets(next)
                    }}
                  >
                    Finish Exercise
                  </Button>
                )}
              </>
            )
          })()}
        </div>
      )}

      {!isActive && !isDone && (
        <button
          type="button"
          onClick={onStart}
          style={{
            marginTop: spacing[3],
            width: '100%',
            padding: '12px',
            borderRadius: 12,
            border: `1px dashed ${colors.borderSubtle}`,
            background: 'transparent',
            color: colors.accent,
            fontWeight: 600,
            fontSize: 14,
            cursor: 'pointer',
          }}
        >
          Log Sets
        </button>
      )}
    </div>
  )
}

function PhaseSection({
  block,
  completion,
  saving,
  activeExercise,
  setActiveExercise,
  nextIncompleteId,
  onPatch,
}: {
  block: WorkoutPhaseBlock
  completion: TrackerCompletion
  saving: boolean
  activeExercise: string | null
  setActiveExercise: (id: string | null) => void
  nextIncompleteId: string | null
  onPatch: (patch: TrackerCompletion) => Promise<void>
}) {
  const phaseProgress = getPhaseProgress(block, completion)
  const defaultOpen = block.phase === 'main' || block.phase === 'warmup'

  return (
    <TrackerPhaseFolder
      title={block.label}
      subtitle={`${phaseProgress.completed}/${phaseProgress.total} exercises`}
      progress={phaseProgress.percent}
      defaultOpen={defaultOpen}
    >
      {block.exercises.map((ex) => {
        const exData = completion.exercises?.[ex.id]
        const sets: ExerciseSetLog[] =
          exData?.sets ?? Array.from({ length: ex.targetSets }, () => ({} as ExerciseSetLog))
        const isDone = Boolean(exData?.completed)
        const isActive = activeExercise === ex.id || (!activeExercise && !isDone && ex.id === nextIncompleteId)

        return (
          <ExerciseCard
            key={ex.id}
            ex={ex}
            exData={exData}
            sets={sets}
            isDone={isDone}
            isActive={isActive}
            saving={saving}
            onStart={() => setActiveExercise(ex.id)}
            onPatch={onPatch}
          />
        )
      })}
    </TrackerPhaseFolder>
  )
}

export function WorkoutTrackerSection({ workout, completion, workoutScore, saving, onPatch }: Props) {
  const [activeExercise, setActiveExercise] = useState<string | null>(null)
  const [startedAt, setStartedAt] = useState<number | null>(null)
  const [elapsed, setElapsed] = useState(0)

  const progress = getWorkoutProgress(workout, completion)
  const volume = computeWorkoutVolume(completion)
  const remainingMin = estimateRemainingMinutes(workout, completion)

  const nextIncompleteId =
    workout.exercises.find((ex) => !completion.exercises?.[ex.id]?.completed)?.id ?? null

  const sessionTitle = [workout.dayLabel, workout.focus].filter(Boolean).join(' · ')

  useEffect(() => {
    const anyLogged = workout.exercises.some((ex) => {
      const sets = completion.exercises?.[ex.id]?.sets ?? []
      return sets.some((s) => s.reps != null || s.weight != null)
    })
    if (anyLogged && !startedAt) setStartedAt(Date.now())
  }, [completion.exercises, workout.exercises, startedAt])

  useEffect(() => {
    if (!startedAt || progress.percent >= 100) return
    const id = window.setInterval(() => setElapsed(Math.floor((Date.now() - startedAt) / 1000)), 1000)
    return () => window.clearInterval(id)
  }, [startedAt, progress.percent])

  return (
    <div style={{ paddingTop: spacing[3] }}>
      {sessionTitle && (
        <div
          style={{
            padding: '14px 16px',
            borderRadius: radius.md,
            background: `linear-gradient(135deg, ${colors.accentMuted}, transparent)`,
            border: `1px solid ${colors.accentMuted}`,
            marginBottom: spacing[3],
          }}
        >
          <div style={{ fontSize: 11, color: colors.accent, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            Scheduled Session
          </div>
          <div style={{ fontSize: 20, fontWeight: 800, marginTop: 6, letterSpacing: '-0.02em' }}>{sessionTitle}</div>
        </div>
      )}

      {workout.workoutNotes && (
        <p
          style={{
            margin: `0 0 ${spacing[3]}px`,
            padding: '12px 14px',
            borderRadius: 12,
            background: colors.bgElevated,
            fontSize: 13,
            color: colors.textSecondary,
            lineHeight: 1.5,
            whiteSpace: 'pre-wrap',
          }}
        >
          {workout.workoutNotes}
        </p>
      )}

      <div style={{ marginBottom: spacing[3] }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 14 }}>
          <span style={{ color: colors.textSecondary }}>
            {progress.completed} / {progress.total} exercises
          </span>
          <span style={{ fontWeight: 700, color: colors.accent }}>{workoutScore}%</span>
        </div>
        <ProgressBar percent={workoutScore} height={10} />
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
          gap: 8,
          marginBottom: spacing[4],
        }}
      >
        <StatTile label="Duration" value={startedAt ? formatDuration(elapsed) : '—'} />
        <StatTile label="Est. remaining" value={remainingMin > 0 ? `${remainingMin} min` : '—'} />
        <StatTile label="Volume" value={volume > 0 ? `${volume.toLocaleString()} kg` : '—'} />
        <StatTile label="Done" value={`${progress.completed}/${progress.total}`} />
      </div>

      {workout.phases.map((block) => (
        <PhaseSection
          key={block.id}
          block={block}
          completion={completion}
          saving={saving}
          activeExercise={activeExercise}
          setActiveExercise={setActiveExercise}
          nextIncompleteId={nextIncompleteId}
          onPatch={onPatch}
        />
      ))}
    </div>
  )
}
