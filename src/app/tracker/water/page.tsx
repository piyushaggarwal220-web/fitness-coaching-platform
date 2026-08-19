'use client'

import { WaterModule } from '@/components/tracker/modules/WaterModule'
import { TrackerModulePage } from '@/components/tracker/ModulePageGate'
import { useTracker } from '@/components/tracker/context/TrackerContext'

export default function WaterTrackerPage() {
  const { sections, day, scores, saving, patchCompletion } = useTracker()

  return (
    <TrackerModulePage title="Water Tracker" isAvailable={Boolean(sections?.water)} emptyMessage="Water target is not set in your plan yet. Open your plan or ask your coach to add it.">
      {sections?.water && day && scores && (
        <WaterModule
          water={sections.water}
          completion={day.completion}
          waterScore={scores.water}
          saving={saving}
          onPatch={patchCompletion}
        />
      )}
    </TrackerModulePage>
  )
}
