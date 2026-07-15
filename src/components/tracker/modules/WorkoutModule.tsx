'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Check, Pause, Play, Save, Square } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { RestTimer } from '@/components/tracker/RestTimer'
import {
  ProgressBar,
  StatTile,
  TrackerPhaseFolder,
  trackerInputStyle,
} from '@/components/tracker/TrackerPrimitives'
import { colors, radius, spacing } from '@/lib/design-tokens'
import {
  buildExercisePatch,
  durationFromParts,
  formatDurationInput,
  formatExerciseTarget,
  formatRestClock,
  getCurrentExercise,
  getExerciseSets,
  inferTrackingMode,
  resolveRestSeconds,
} from '@/lib/daily-tracker/exercise-utils'
import {
  computeWorkoutVolume,
  estimateRemainingMinutes,
  getPhaseProgress,
  getWorkoutProgress,
} from '@/lib/daily-tracker/display'
import { suggestedWorkoutDayKey } from '@/lib/daily-tracker/parser'
import type { ExerciseSetLog, TrackerCompletion, TrackerExerciseItem, TrackerWorkoutItem } from '@/lib/daily-tracker/types'
import { ExerciseDemoButton } from '@/components/exercises/ExerciseDemoButton'

type WorkoutDayOption = { key: string; label: string }

type Props = {
  workouts: TrackerWorkoutItem[]
  workoutDays?: WorkoutDayOption[]
  completion: TrackerCompletion
  workoutScore: number
  saving: boolean
  onPatch: (patch: TrackerCompletion) => Promise<void>
}

function deriveWorkoutDays(
  workouts: TrackerWorkoutItem[],
  explicit?: WorkoutDayOption[]
): WorkoutDayOption[] {
  if (explicit && explicit.length > 0) return explicit
  const map = new Map<string, string>()
  for (const workout of workouts) {
    if (workout.workoutDay) {
      map.set(workout.workoutDay, workout.workoutDayLabel ?? workout.workoutDay)
    }
  }
  return Array.from(map.entries()).map(([key, label]) => ({ key, label }))
}

type RestState = {
  seconds: number
  exerciseName: string
  nextLabel: string
}

const MAX_SESSION_MS = 4 * 60 * 60 * 1000

function formatDuration(totalSeconds: number) {
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
  }
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

export function WorkoutModule({
  workouts,
  workoutDays,
  completion,
  workoutScore,
  saving,
  onPatch,
}: Props) {
  const days = useMemo(() => deriveWorkoutDays(workouts, workoutDays), [workouts, workoutDays])
  const multiDay = days.length > 1
  const selectedKey = completion.selectedWorkoutDay ?? null
  const selectedDay = days.find((d) => d.key === selectedKey) ?? null
  const suggestion = suggestedWorkoutDayKey(days)

  const workout = useMemo(() => {
    if (workouts.length === 0) return null
    if (!multiDay) return workouts[0] ?? null
    if (!selectedKey) return null
    return workouts.find((w) => w.workoutDay === selectedKey) ?? null
  }, [workouts, multiDay, selectedKey])

  const [sessionRunning, setSessionRunning] = useState(false)
  const [sessionStartedAt, setSessionStartedAt] = useState<number | null>(null)
  const [elapsedMs, setElapsedMs] = useState(0)
  const [rest, setRest] = useState<RestState | null>(null)
  const [autoStopped, setAutoStopped] = useState(false)
  const [confirmSaveOpen, setConfirmSaveOpen] = useState(false)
  const [saveMessage, setSaveMessage] = useState('')

  const progress = getWorkoutProgress(workout, completion)
  const volume = computeWorkoutVolume(completion)
  const remainingMin = estimateRemainingMinutes(workout, completion)
  const currentEx = workout
    ? getCurrentExercise(workout.exercises, completion.exercises)
    : null
  const sessionTitle = workout
    ? [workout.dayLabel, workout.focus].filter(Boolean).join(' · ')
    : ''
  const hasWarmup = workout?.phases.some((phase) => phase.phase === 'warmup') ?? false
  const workoutSaved = completion.workoutSession?.status === 'saved'

  const phaseDefaults = useMemo(() => {
    if (!workout) {
      return {
        warmup: false,
        mobility: true,
        main: true,
        finisher: true,
        cooldown: false,
      } as const
    }
    const warmupBlock = workout.phases.find((phase) => phase.phase === 'warmup')
    const warmupDone =
      warmupBlock?.exercises.every((ex) => completion.exercises?.[ex.id]?.completed) ?? true
    return {
      warmup: hasWarmup && !warmupDone,
      mobility: true,
      main: !hasWarmup || warmupDone,
      finisher: true,
      cooldown: progress.percent >= 70,
    } as const
  }, [workout, completion.exercises, progress.percent, hasWarmup])

  const stopSession = useCallback(() => {
    setSessionRunning(false)
    setSessionStartedAt(null)
  }, [])

  const startSession = useCallback(() => {
    setAutoStopped(false)
    setSaveMessage('')
    setSessionStartedAt(Date.now() - elapsedMs)
    setSessionRunning(true)
  }, [elapsedMs])

  const resetSession = useCallback(() => {
    setSessionRunning(false)
    setSessionStartedAt(null)
    setElapsedMs(0)
    setAutoStopped(false)
  }, [])

  const selectWorkoutDay = useCallback(
    (key: string | null) => {
      resetSession()
      setRest(null)
      setConfirmSaveOpen(false)
      setSaveMessage('')
      void onPatch({
        selectedWorkoutDay: key,
        workoutSession: null,
      })
    },
    [onPatch, resetSession]
  )

  useEffect(() => {
    if (!sessionRunning || sessionStartedAt == null) return

    const tick = () => {
      const ms = Date.now() - sessionStartedAt
      if (ms >= MAX_SESSION_MS) {
        setElapsedMs(MAX_SESSION_MS)
        setSessionRunning(false)
        setSessionStartedAt(null)
        setAutoStopped(true)
        return
      }
      setElapsedMs(ms)
    }

    tick()
    const id = window.setInterval(tick, 1000)
    return () => window.clearInterval(id)
  }, [sessionRunning, sessionStartedAt])

  if (multiDay && !selectedKey) {
    return (
      <div>
        <div
          style={{
            padding: spacing[4],
            borderRadius: radius.lg,
            background: colors.bgGlass,
            border: `1px solid ${colors.borderSubtle}`,
            marginBottom: spacing[4],
          }}
        >
          <p
            style={{
              margin: 0,
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: colors.accent,
            }}
          >
            Workout day
          </p>
          <h2 style={{ margin: '8px 0 0', fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em' }}>
            Which day&apos;s workout are you following?
          </h2>
          <p style={{ margin: '10px 0 0', fontSize: 14, color: colors.textSecondary, lineHeight: 1.5 }}>
            Your plan has different sessions for different days. Pick today&apos;s workout and we&apos;ll
            load that session.
          </p>
        </div>

        <div style={{ display: 'grid', gap: 10 }}>
          {days.map((day) => {
            const option = workouts.find((w) => w.workoutDay === day.key)
            const isSuggested = day.key === suggestion
            const focus = option?.focus
            return (
              <button
                key={day.key}
                type="button"
                disabled={saving}
                onClick={() => selectWorkoutDay(day.key)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12,
                  padding: '16px 18px',
                  borderRadius: radius.lg,
                  border: `1px solid ${isSuggested ? colors.accentMuted : colors.borderSubtle}`,
                  background: isSuggested ? colors.accentMuted : colors.bgGlass,
                  color: colors.textPrimary,
                  cursor: saving ? 'wait' : 'pointer',
                  textAlign: 'left',
                  font: 'inherit',
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 16, fontWeight: 700 }}>{day.label}</div>
                  {focus && (
                    <div style={{ marginTop: 4, fontSize: 13, color: colors.textMuted }}>{focus}</div>
                  )}
                </div>
                {isSuggested && (
                  <span style={{ fontSize: 12, fontWeight: 700, color: colors.accent, flexShrink: 0 }}>
                    Today
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  if (!workout) {
    return (
      <p style={{ margin: 0, color: colors.textMuted, fontSize: 15 }}>
        No workout found for this day in your active plan.
      </p>
    )
  }

  const startRestIfNeeded = (ex: TrackerExerciseItem, setIdx: number) => {
    const restSeconds = resolveRestSeconds(ex)
    if (restSeconds <= 0) return

    const hasMoreSets = setIdx < ex.targetSets - 1
    if (hasMoreSets) {
      setRest({
        seconds: restSeconds,
        exerciseName: ex.name,
        nextLabel: `Set ${setIdx + 2}`,
      })
      return
    }

    const exIndex = workout.exercises.findIndex((item) => item.id === ex.id)
    const nextEx = workout.exercises.slice(exIndex + 1).find((item) => item.phase === ex.phase)
    if (nextEx) {
      setRest({
        seconds: Math.min(restSeconds, 90),
        exerciseName: ex.name,
        nextLabel: nextEx.name,
      })
    }
  }

  const updateSet = (exId: string, ex: TrackerExerciseItem, setIdx: number, patch: Partial<ExerciseSetLog>) => {
    const data = completion.exercises?.[exId]
    const sets = getExerciseSets(ex, data)
    const next = [...sets]
    next[setIdx] = { ...next[setIdx], ...patch }
    void onPatch({ exercises: { [exId]: buildExercisePatch(ex, data, next) } })
  }

  const completeSet = (exId: string, ex: TrackerExerciseItem, setIdx: number) => {
    const data = completion.exercises?.[exId]
    const sets = getExerciseSets(ex, data)
    const next = [...sets]
    next[setIdx] = { ...next[setIdx], completed: true }
    void onPatch({ exercises: { [exId]: buildExercisePatch(ex, data, next) } })
    if (!sessionRunning && sessionStartedAt == null && elapsedMs === 0) {
      startSession()
    }
    startRestIfNeeded(ex, setIdx)
  }

  const confirmSaveWorkout = async () => {
    stopSession()
    setRest(null)
    await onPatch({
      workoutSession: {
        status: 'saved',
        savedAt: new Date().toISOString(),
        durationSeconds: Math.floor(elapsedMs / 1000),
      },
    })
    setConfirmSaveOpen(false)
    setSaveMessage('Workout saved.')
  }

  const elapsedSeconds = Math.floor(elapsedMs / 1000)

  return (
    <div>
      {multiDay && selectedDay && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            marginBottom: spacing[4],
            padding: '12px 14px',
            borderRadius: radius.md,
            background: colors.bgElevated,
            border: `1px solid ${colors.borderSubtle}`,
          }}
        >
          <div>
            <div style={{ fontSize: 12, color: colors.textMuted, marginBottom: 2 }}>Following</div>
            <div style={{ fontSize: 16, fontWeight: 800 }}>
              {selectedDay.label}
              {workout.focus ? ` · ${workout.focus}` : ' workout'}
            </div>
          </div>
          <Button variant="secondary" disabled={saving} onClick={() => selectWorkoutDay(null)}>
            Change day
          </Button>
        </div>
      )}

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

      <div
        style={{
          marginBottom: spacing[4],
          padding: spacing[4],
          borderRadius: radius.lg,
          background: colors.bgGlass,
          border: `1px solid ${colors.borderSubtle}`,
        }}
      >
        <div>
          <div style={{ fontSize: 12, color: colors.textMuted, fontWeight: 700, textTransform: 'uppercase' }}>
            Session timer
          </div>
          <div
            style={{
              marginTop: 6,
              fontSize: 36,
              fontWeight: 800,
              letterSpacing: '-0.03em',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {formatDuration(
              workoutSaved && completion.workoutSession?.durationSeconds != null && elapsedMs === 0
                ? completion.workoutSession.durationSeconds
                : elapsedSeconds
            )}
          </div>
          <div style={{ marginTop: 4, fontSize: 12, color: colors.textMuted }}>
            {workoutSaved && !sessionRunning
              ? `Saved${
                  completion.workoutSession?.savedAt
                    ? ` · ${new Date(completion.workoutSession.savedAt).toLocaleTimeString()}`
                    : ''
                }`
              : autoStopped
                ? 'Auto-stopped after 4 hours'
                : sessionRunning
                  ? 'Running · auto-stops at 4 hours'
                  : 'Start when you begin your session'}
          </div>
          {saveMessage && (
            <div style={{ marginTop: 6, fontSize: 13, color: colors.success, fontWeight: 700 }}>{saveMessage}</div>
          )}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: spacing[3] }}>
          <button
            type="button"
            onClick={() => (sessionRunning ? stopSession() : startSession())}
            style={{
              height: 48,
              borderRadius: 12,
              border: 'none',
              background: sessionRunning ? colors.bgElevated : colors.accent,
              color: sessionRunning ? colors.textPrimary : colors.textInverse,
              fontWeight: 800,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
            }}
          >
            {sessionRunning ? <Pause size={18} /> : <Play size={18} />}
            {sessionRunning ? 'Stop' : elapsedMs > 0 ? 'Resume' : 'Start'}
          </button>
          <button
            type="button"
            onClick={() => setConfirmSaveOpen(true)}
            disabled={saving}
            style={{
              height: 48,
              borderRadius: 12,
              border: 'none',
              background: workoutSaved ? colors.successMuted : colors.accentMuted,
              color: workoutSaved ? colors.success : colors.textPrimary,
              fontWeight: 800,
              cursor: saving ? 'wait' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
            }}
          >
            <Save size={18} />
            {workoutSaved ? 'Save again' : 'Save workout'}
          </button>
        </div>

        <button
          type="button"
          onClick={resetSession}
          disabled={elapsedMs === 0 && !sessionRunning}
          style={{
            marginTop: 8,
            width: '100%',
            height: 40,
            borderRadius: 12,
            border: `1px solid ${colors.borderSubtle}`,
            background: 'transparent',
            color: colors.textMuted,
            fontWeight: 600,
            cursor: elapsedMs === 0 && !sessionRunning ? 'default' : 'pointer',
            opacity: elapsedMs === 0 && !sessionRunning ? 0.5 : 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
          }}
        >
          <Square size={14} />
          Reset timer
        </button>
      </div>

      <div style={{ marginBottom: spacing[3] }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 14 }}>
          <span style={{ color: colors.textSecondary }}>
            {progress.completed} / {progress.total} exercises
          </span>
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

      {workout.phases.map((block) => (
        <TrackerPhaseFolder
          key={block.id}
          title={block.label}
          subtitle={`${getPhaseProgress(block, completion).completed}/${block.exercises.length} exercises`}
          progress={getPhaseProgress(block, completion).percent}
          defaultOpen={
            block.phase === 'warmup' ||
            phaseDefaults[block.phase] ||
            block.exercises.some((ex) => ex.id === currentEx?.id)
          }
        >
          {block.exercises.map((ex) => {
            const exData = completion.exercises?.[ex.id]
            const sets = getExerciseSets(ex, exData)
            const isDone = Boolean(exData?.completed)
            const isCurrent = currentEx?.id === ex.id
            const defaultWeight = ex.targetWeight?.replace(/[^\d.]/g, '')
            const restSeconds = resolveRestSeconds(ex)

            return (
              <div
                key={ex.id}
                style={{
                  borderRadius: 14,
                  padding: spacing[3],
                  marginBottom: 12,
                  background: isDone ? colors.successMuted : isCurrent ? colors.accentMuted : colors.bgCard,
                  border: `1px solid ${
                    isDone ? 'rgba(34,197,94,0.25)' : isCurrent ? colors.accentMuted : colors.borderSubtle
                  }`,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <div style={{ fontWeight: 800, fontSize: 17 }}>{ex.name}</div>
                      <ExerciseDemoButton exerciseName={ex.name} />
                    </div>
                    <div style={{ fontSize: 13, color: colors.textMuted, marginTop: 4 }}>
                      {formatExerciseTarget(ex)}
                      {restSeconds > 0 ? ` · Rest ${formatRestClock(restSeconds)}` : ''}
                    </div>
                    {ex.notes && (
                      <div style={{ fontSize: 12, color: colors.textSecondary, marginTop: 6, lineHeight: 1.4 }}>
                        {ex.notes}
                      </div>
                    )}
                  </div>
                  {isDone && <Check size={24} color={colors.success} strokeWidth={3} />}
                </div>

                {(() => {
                  const mode = inferTrackingMode(ex)
                  const doneBtn = (setCompleted: boolean, onClick: () => void) => (
                    <button
                      type="button"
                      disabled={saving || isDone || setCompleted}
                      onClick={onClick}
                      style={{
                        height: 48,
                        padding: '0 14px',
                        borderRadius: 12,
                        border: 'none',
                        background: setCompleted ? colors.successMuted : colors.accent,
                        color: setCompleted ? colors.success : colors.textInverse,
                        fontWeight: 700,
                        fontSize: 13,
                        cursor: setCompleted ? 'default' : 'pointer',
                      }}
                    >
                      {setCompleted ? '✓' : 'Done'}
                    </button>
                  )

                  if (mode === 'checkoff') {
                    return (
                      <button
                        type="button"
                        disabled={saving || isDone}
                        onClick={() => {
                          const next = getExerciseSets(ex, exData).map((s, i) =>
                            i === 0 ? { ...s, completed: true } : s
                          )
                          void onPatch({ exercises: { [ex.id]: buildExercisePatch(ex, exData, next) } })
                          if (!sessionRunning && sessionStartedAt == null && elapsedMs === 0) {
                            startSession()
                          }
                        }}
                        style={{
                          marginTop: 12,
                          width: '100%',
                          height: 48,
                          borderRadius: 12,
                          border: 'none',
                          background: isDone ? colors.successMuted : colors.accent,
                          color: isDone ? colors.success : colors.textInverse,
                          fontWeight: 700,
                          fontSize: 14,
                          cursor: isDone ? 'default' : 'pointer',
                        }}
                      >
                        {isDone ? '✓ Done' : 'Mark complete'}
                      </button>
                    )
                  }

                  return sets.map((set, idx) => {
                    const durParts = formatDurationInput(set.durationSeconds)
                    return (
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
                          {ex.targetSets > 1
                            ? `Set ${idx + 1}`
                            : mode === 'timed'
                              ? 'Duration'
                              : mode === 'distance'
                                ? 'Distance'
                                : 'Set'}
                        </div>

                        {mode === 'timed' && (
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 8, alignItems: 'end' }}>
                            <div>
                              <label style={{ fontSize: 10, color: colors.textMuted }}>Minutes</label>
                              <input
                                type="number"
                                min={0}
                                placeholder={
                                  ex.targetDurationSeconds != null
                                    ? String(Math.floor(ex.targetDurationSeconds / 60) || '')
                                    : '0'
                                }
                                value={durParts.minutes}
                                disabled={saving || isDone || set.completed}
                                onChange={(e) =>
                                  updateSet(ex.id, ex, idx, {
                                    durationSeconds: durationFromParts(e.target.value, durParts.seconds),
                                  })
                                }
                                style={trackerInputStyle}
                              />
                            </div>
                            <div>
                              <label style={{ fontSize: 10, color: colors.textMuted }}>Seconds</label>
                              <input
                                type="number"
                                min={0}
                                max={59}
                                placeholder={
                                  ex.targetDurationSeconds != null
                                    ? String(ex.targetDurationSeconds % 60 || '')
                                    : '0'
                                }
                                value={durParts.seconds}
                                disabled={saving || isDone || set.completed}
                                onChange={(e) =>
                                  updateSet(ex.id, ex, idx, {
                                    durationSeconds: durationFromParts(durParts.minutes, e.target.value),
                                  })
                                }
                                style={trackerInputStyle}
                              />
                            </div>
                            {doneBtn(Boolean(set.completed), () => completeSet(ex.id, ex, idx))}
                          </div>
                        )}

                        {mode === 'distance' && (
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, alignItems: 'end' }}>
                            <div>
                              <label style={{ fontSize: 10, color: colors.textMuted }}>Meters</label>
                              <input
                                type="number"
                                min={0}
                                placeholder={
                                  ex.targetDistanceMeters != null ? String(ex.targetDistanceMeters) : '—'
                                }
                                value={set.distanceMeters ?? ''}
                                disabled={saving || isDone || set.completed}
                                onChange={(e) =>
                                  updateSet(ex.id, ex, idx, {
                                    distanceMeters: Number(e.target.value) || undefined,
                                  })
                                }
                                style={trackerInputStyle}
                              />
                            </div>
                            {doneBtn(Boolean(set.completed), () => completeSet(ex.id, ex, idx))}
                          </div>
                        )}

                        {mode === 'reps_only' && (
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, alignItems: 'end' }}>
                            <div>
                              <label style={{ fontSize: 10, color: colors.textMuted }}>Reps</label>
                              <input
                                type="number"
                                placeholder={ex.targetReps.replace(/[^\d-].*$/, '') || ex.targetReps}
                                value={set.reps ?? ''}
                                disabled={saving || isDone || set.completed}
                                onChange={(e) =>
                                  updateSet(ex.id, ex, idx, { reps: Number(e.target.value) || undefined })
                                }
                                style={trackerInputStyle}
                              />
                            </div>
                            {doneBtn(Boolean(set.completed), () => completeSet(ex.id, ex, idx))}
                          </div>
                        )}

                        {mode === 'strength' && (
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 8, alignItems: 'end' }}>
                            <div>
                              <label style={{ fontSize: 10, color: colors.textMuted }}>Weight (kg)</label>
                              <input
                                type="number"
                                placeholder={defaultWeight || '—'}
                                value={set.weight ?? ''}
                                disabled={saving || isDone || set.completed}
                                onChange={(e) =>
                                  updateSet(ex.id, ex, idx, { weight: Number(e.target.value) || undefined })
                                }
                                style={trackerInputStyle}
                              />
                            </div>
                            <div>
                              <label style={{ fontSize: 10, color: colors.textMuted }}>Reps</label>
                              <input
                                type="number"
                                placeholder={ex.targetReps.replace(/[^\d-].*$/, '') || ex.targetReps}
                                value={set.reps ?? ''}
                                disabled={saving || isDone || set.completed}
                                onChange={(e) =>
                                  updateSet(ex.id, ex, idx, { reps: Number(e.target.value) || undefined })
                                }
                                style={trackerInputStyle}
                              />
                            </div>
                            {doneBtn(Boolean(set.completed), () => completeSet(ex.id, ex, idx))}
                          </div>
                        )}
                      </div>
                    )
                  })
                })()}
              </div>
            )
          })}
        </TrackerPhaseFolder>
      ))}

      {rest && (
        <RestTimer
          seconds={rest.seconds}
          exerciseName={rest.exerciseName}
          nextLabel={rest.nextLabel}
          onDismiss={() => setRest(null)}
        />
      )}

      {confirmSaveOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="save-workout-title"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 80,
            background: 'rgba(0,0,0,0.55)',
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'center',
            padding: spacing[4],
          }}
          onClick={() => setConfirmSaveOpen(false)}
        >
          <div
            style={{
              width: '100%',
              maxWidth: 420,
              borderRadius: radius.lg,
              background: colors.bgPrimary,
              border: `1px solid ${colors.borderSubtle}`,
              padding: spacing[5],
              boxShadow: '0 20px 60px rgba(0,0,0,0.45)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="save-workout-title" style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>
              Save today&apos;s workout?
            </h2>
            <p style={{ margin: '10px 0 0', fontSize: 14, color: colors.textSecondary, lineHeight: 1.5 }}>
              This will save your logged sets, warm-up progress, and session time (
              {formatDuration(elapsedSeconds)}). You can keep editing after saving.
            </p>
            <p style={{ margin: '12px 0 0', fontSize: 14, color: colors.textMuted }}>
              {progress.completed}/{progress.total} exercises complete
              {volume > 0 ? ` · ${volume.toLocaleString()} kg volume` : ''}
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: spacing[4] }}>
              <button
                type="button"
                onClick={() => setConfirmSaveOpen(false)}
                disabled={saving}
                style={{
                  height: 48,
                  borderRadius: 12,
                  border: `1px solid ${colors.borderSubtle}`,
                  background: colors.bgElevated,
                  color: colors.textPrimary,
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void confirmSaveWorkout()}
                disabled={saving}
                style={{
                  height: 48,
                  borderRadius: 12,
                  border: 'none',
                  background: colors.accent,
                  color: colors.textInverse,
                  fontWeight: 800,
                  cursor: saving ? 'wait' : 'pointer',
                }}
              >
                {saving ? 'Saving…' : 'Confirm save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
