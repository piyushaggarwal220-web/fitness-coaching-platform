'use client'

import { CardioModule } from '@/components/tracker/modules/CardioModule'
import { TrackerModulePage } from '@/components/tracker/ModulePageGate'
import { useTracker } from '@/components/tracker/context/TrackerContext'

export default function CardioTrackerPage() {
  const { sections, day, saving, patchCompletion } = useTracker()

  return (
    <TrackerModulePage
      title="Cardio Tracker"
      isAvailable={Boolean(sections?.cardio.length)}
      emptyMessage="No cardio sessions found in your active plan."
    >
      {sections && day && (
        <CardioModule items={sections.cardio} completion={day.completion} saving={saving} onPatch={patchCompletion} />
      )}
    </TrackerModulePage>
  )
}
