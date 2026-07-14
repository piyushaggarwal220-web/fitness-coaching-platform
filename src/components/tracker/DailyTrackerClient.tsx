'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { ClientShell } from '@/components/ui/ClientShell'
import { EmptyState } from '@/components/ui/EmptyState'
import { CardioTrackerSection } from '@/components/tracker/CardioTrackerSection'
import { CoachNotesCard, MotivationCard } from '@/components/tracker/CoachMotivationCards'
import { DietTrackerSection } from '@/components/tracker/DietTrackerSection'
import { SleepTrackerSection } from '@/components/tracker/SleepTrackerSection'
import { StepsTrackerSection } from '@/components/tracker/StepsTrackerSection'
import { SupplementsTrackerSection } from '@/components/tracker/SupplementsTrackerSection'
import { TodayProgressHeader } from '@/components/tracker/TodayProgressHeader'
import { TrackerFolder } from '@/components/tracker/TrackerPrimitives'
import { WaterTrackerSection } from '@/components/tracker/WaterTrackerSection'
import { WorkoutTrackerSection } from '@/components/tracker/WorkoutTrackerSection'
import { colors } from '@/lib/design-tokens'
import { buildMotivationMessage, getCategoryDisplayScores, splitSnapshot } from '@/lib/daily-tracker/display'
import type { DailyTrackerDay, TodayTrackerView, TrackerCompletion } from '@/lib/daily-tracker/types'
import { ClipboardList } from 'lucide-react'
import { useRouter } from 'next/navigation'

type Props = {
  initialView: TodayTrackerView | null
  initialError: string | null
}

export function DailyTrackerClient({ initialView, initialError }: Props) {
  const router = useRouter()
  const [view, setView] = useState(initialView)
  const [error, setError] = useState(initialError ?? '')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setView(initialView)
    setError(initialError ?? '')
  }, [initialView, initialError])

  const day = view?.day ?? null

  const sections = useMemo(() => (day ? splitSnapshot(day.snapshot) : null), [day])
  const scores = useMemo(() => (day ? getCategoryDisplayScores(day) : null), [day])
  const motivation = useMemo(() => (view ? buildMotivationMessage(view) : ''), [view])

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
        setView((current) => (current ? { ...current, day: data.day! } : current))
      } finally {
        setSaving(false)
      }
    },
    [day]
  )

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

  if (!view || !day || !sections || !scores) {
    return <ClientShell title="Today's Tracker" loading />
  }

  const mealsDone = sections.meals.filter((m) => day.completion.meals?.[m.id]?.completed).length
  const suppsDone = sections.supplements.filter((s) => day.completion.supplements?.[s.id]?.completed).length
  const workoutSubtitle = sections.workout
    ? [sections.workout.dayLabel, sections.workout.focus].filter(Boolean).join(' · ') ||
      `${sections.workout.exercises.length} exercises`
    : undefined

  return (
    <ClientShell title="Today's Tracker">
      <TodayProgressHeader view={view} />

      {sections.meals.length > 0 && (
        <TrackerFolder
          title="Diet Tracker"
          subtitle={`${mealsDone} of ${sections.meals.length} meals complete`}
          icon="🥗"
          progress={scores.diet}
          defaultOpen
          accent
          staggerIndex={1}
        >
          <DietTrackerSection
            meals={sections.meals}
            completion={day.completion}
            dietScore={scores.diet}
            saving={saving}
            onPatch={patchCompletion}
          />
        </TrackerFolder>
      )}

      {sections.workout && (
        <TrackerFolder
          title="Workout Tracker"
          subtitle={workoutSubtitle}
          icon="🏋"
          progress={scores.workout}
          defaultOpen
          staggerIndex={2}
        >
          <WorkoutTrackerSection
            workout={sections.workout}
            completion={day.completion}
            workoutScore={scores.workout}
            saving={saving}
            onPatch={patchCompletion}
          />
        </TrackerFolder>
      )}

      {sections.cardio.length > 0 && (
        <TrackerFolder
          title="Cardio"
          subtitle={`${sections.cardio.length} session${sections.cardio.length > 1 ? 's' : ''} today`}
          icon="🏃"
          progress={scores.cardio}
          staggerIndex={3}
        >
          <CardioTrackerSection
            items={sections.cardio}
            completion={day.completion}
            saving={saving}
            onPatch={patchCompletion}
          />
        </TrackerFolder>
      )}

      {sections.steps && (
        <TrackerFolder
          title="Steps"
          subtitle={`Goal ${Number(sections.steps.target).toLocaleString()}`}
          icon="👟"
          progress={scores.steps}
          staggerIndex={4}
        >
          <StepsTrackerSection
            steps={sections.steps}
            completion={day.completion}
            saving={saving}
            onPatch={patchCompletion}
          />
        </TrackerFolder>
      )}

      {sections.water && (
        <TrackerFolder
          title="Water"
          subtitle={`${(day.completion.water?.ml ?? 0).toLocaleString()} / ${sections.water.targetMl.toLocaleString()} ml`}
          icon="💧"
          progress={scores.water}
          staggerIndex={5}
        >
          <WaterTrackerSection
            water={sections.water}
            completion={day.completion}
            waterScore={scores.water}
            saving={saving}
            onPatch={patchCompletion}
          />
        </TrackerFolder>
      )}

      {sections.supplements.length > 0 && (
        <TrackerFolder
          title="Supplements"
          subtitle={`${suppsDone} of ${sections.supplements.length} taken`}
          icon="💊"
          progress={scores.supplements}
          staggerIndex={6}
        >
          <SupplementsTrackerSection
            supplements={sections.supplements}
            completion={day.completion}
            supplementsScore={scores.supplements}
            saving={saving}
            onPatch={patchCompletion}
          />
        </TrackerFolder>
      )}

      {sections.sleep && (
        <TrackerFolder
          title="Sleep"
          subtitle={`Goal ${sections.sleep.targetHours ?? 8}h`}
          icon="🌙"
          progress={scores.sleep}
          staggerIndex={7}
        >
          <SleepTrackerSection
            sleep={sections.sleep}
            completion={day.completion}
            sleepScore={scores.sleep}
            saving={saving}
            onPatch={patchCompletion}
          />
        </TrackerFolder>
      )}

      {sections.coachNote && (
        <TrackerFolder title="Coach Notes" subtitle="Today's reminders" icon="📋" staggerIndex={8}>
          <CoachNotesCard note={sections.coachNote} />
        </TrackerFolder>
      )}

      <MotivationCard message={motivation} staggerIndex={9} />
    </ClientShell>
  )
}
