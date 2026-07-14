'use client'

import { SleepModule } from '@/components/tracker/modules/SleepModule'
import { TrackerModulePage } from '@/components/tracker/ModulePageGate'
import { useTracker } from '@/components/tracker/context/TrackerContext'

export default function SleepTrackerPage() {
  const { sections, day, scores, saving, patchCompletion } = useTracker()

  return (
    <TrackerModulePage title="Sleep Tracker" isAvailable={Boolean(sections?.sleep)} emptyMessage="Sleep tracking is not available.">
      {sections?.sleep && day && scores && (
        <SleepModule
          sleep={sections.sleep}
          completion={day.completion}
          sleepScore={scores.sleep}
          saving={saving}
          onPatch={patchCompletion}
        />
      )}
    </TrackerModulePage>
  )
}
