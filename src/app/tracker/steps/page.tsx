'use client'

import { StepsModule } from '@/components/tracker/modules/StepsModule'
import { TrackerModulePage } from '@/components/tracker/ModulePageGate'
import { useTracker } from '@/components/tracker/context/TrackerContext'

export default function StepsTrackerPage() {
  const { sections, day, saving, patchCompletion } = useTracker()

  return (
    <TrackerModulePage
      title="Step Tracker"
      isAvailable={Boolean(sections?.steps)}
      emptyMessage="No step goal found in your active plan. Add a steps target in your cardio section (e.g. 10000 steps daily)."
    >
      {sections?.steps && day && (
        <StepsModule steps={sections.steps} completion={day.completion} saving={saving} onPatch={patchCompletion} />
      )}
    </TrackerModulePage>
  )
}
