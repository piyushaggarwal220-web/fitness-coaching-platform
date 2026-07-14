'use client'

import { DietModule } from '@/components/tracker/modules/DietModule'
import { TrackerModulePage } from '@/components/tracker/ModulePageGate'
import { useTracker } from '@/components/tracker/context/TrackerContext'

export default function DietTrackerPage() {
  const { sections, day, scores, saving, patchCompletion } = useTracker()
  const hasDiet =
    Boolean(sections?.meals.length) || Boolean(day?.snapshot.dietDays?.length)

  return (
    <TrackerModulePage
      title="Diet Tracker"
      isAvailable={hasDiet}
      emptyMessage="No meals found in your active plan. Ask your coach to add a structured nutrition section with meal headers (Breakfast, Lunch, etc.)."
    >
      {sections && day && scores && (
        <DietModule
          meals={sections.meals}
          dietDays={day.snapshot.dietDays}
          completion={day.completion}
          dietScore={scores.diet}
          saving={saving}
          onPatch={patchCompletion}
        />
      )}
    </TrackerModulePage>
  )
}
