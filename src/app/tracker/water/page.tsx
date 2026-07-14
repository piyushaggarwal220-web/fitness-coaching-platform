'use client'

import { WaterModule } from '@/components/tracker/modules/WaterModule'
import { TrackerModulePage } from '@/components/tracker/ModulePageGate'
import { useTracker } from '@/components/tracker/context/TrackerContext'

export default function WaterTrackerPage() {
  const { sections, day, scores, saving, patchCompletion } = useTracker()

  return (
    <TrackerModulePage title="Water Tracker" isAvailable={Boolean(sections?.water)} emptyMessage="Water target not configured in your plan.">
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
