'use client'

import { SupplementsModule } from '@/components/tracker/modules/SupplementsModule'
import { TrackerModulePage } from '@/components/tracker/ModulePageGate'
import { useTracker } from '@/components/tracker/context/TrackerContext'

export default function SupplementsTrackerPage() {
  const { sections, day, saving, patchCompletion } = useTracker()

  return (
    <TrackerModulePage
      title="Supplement Tracker"
      isAvailable={Boolean(sections?.supplements.length)}
      emptyMessage="No supplements listed in your active plan yet. Open your plan, or ask your coach to add them."
    >
      {sections && day && (
        <SupplementsModule
          supplements={sections.supplements}
          completion={day.completion}
          saving={saving}
          onPatch={patchCompletion}
        />
      )}
    </TrackerModulePage>
  )
}
