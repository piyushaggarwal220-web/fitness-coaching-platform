'use client'

import { WorkoutModule } from '@/components/tracker/modules/WorkoutModule'
import { TrackerModulePage } from '@/components/tracker/ModulePageGate'
import { useTracker } from '@/components/tracker/context/TrackerContext'

export default function WorkoutTrackerPage() {
  const { sections, day, scores, saving, patchCompletion } = useTracker()

  return (
    <TrackerModulePage
      title="Workout Tracker"
      isAvailable={Boolean(sections?.workout)}
      emptyMessage="No exercises found for today in your active plan. Ensure your workout plan includes today's session with exercises formatted like: Bench Press 4x8 @ 60 kg"
    >
      {sections?.workout && day && scores && (
        <WorkoutModule
          workout={sections.workout}
          completion={day.completion}
          workoutScore={scores.workout}
          saving={saving}
          onPatch={patchCompletion}
        />
      )}
    </TrackerModulePage>
  )
}
