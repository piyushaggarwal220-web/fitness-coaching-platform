'use client'

import { WorkoutModule } from '@/components/tracker/modules/WorkoutModule'
import { TrackerModulePage } from '@/components/tracker/ModulePageGate'
import { useTracker } from '@/components/tracker/context/TrackerContext'

export default function WorkoutTrackerPage() {
  const { sections, day, scores, saving, error, patchCompletion, rebootNonce } = useTracker()
  const hasWorkouts = (sections?.workouts.length ?? 0) > 0

  return (
    <TrackerModulePage
      title="Workout Tracker"
      isAvailable={hasWorkouts}
      emptyMessage="No exercises found in your active plan yet. Open your plan to confirm the workout section, or ask your coach to add day sessions."
    >
      {hasWorkouts && day && scores && sections && (
        <WorkoutModule
          key={rebootNonce}
          workouts={sections.workouts}
          workoutDays={day.snapshot.workoutDays}
          completion={day.completion}
          workoutScore={scores.workout}
          saving={saving}
          error={error}
          onPatch={patchCompletion}
        />
      )}
    </TrackerModulePage>
  )
}
