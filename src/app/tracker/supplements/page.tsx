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
      emptyMessage="No supplements found in your active plan."
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
