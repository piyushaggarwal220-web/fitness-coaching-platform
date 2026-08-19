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
      emptyMessage="No step goal in your active plan yet. Open your plan, or ask your coach to add a daily steps target."
    >
      {sections?.steps && day && (
        <StepsModule steps={sections.steps} completion={day.completion} saving={saving} onPatch={patchCompletion} />
      )}
    </TrackerModulePage>
  )
}
