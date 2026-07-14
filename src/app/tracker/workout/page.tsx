'use client'

import { WorkoutModule } from '@/components/tracker/modules/WorkoutModule'
import { TrackerModulePage } from '@/components/tracker/ModulePageGate'
import { useTracker } from '@/components/tracker/context/TrackerContext'

export default function WorkoutTrackerPage() {
  const { sections, day, scores, saving, patchCompletion } = useTracker()
  const hasWorkouts = (sections?.workouts.length ?? 0) > 0

  return (
    <TrackerModulePage
      title="Workout Tracker"
      isAvailable={hasWorkouts}
      emptyMessage="No exercises found in your active plan. Ensure your workout plan includes day sessions with exercises formatted like: Bench Press 4x8 @ 60 kg"
    >
      {hasWorkouts && day && scores && sections && (
        <WorkoutModule
          workouts={sections.workouts}
          workoutDays={day.snapshot.workoutDays}
          completion={day.completion}
          workoutScore={scores.workout}
          saving={saving}
          onPatch={patchCompletion}
        />
      )}
    </TrackerModulePage>
  )
}
