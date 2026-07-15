'use client'

import { ClientShell } from '@/components/ui/ClientShell'
import { ExerciseLibraryView } from '@/components/exercises/ExerciseLibraryView'

export default function ExerciseLibraryPage() {
  return (
    <ClientShell title="Exercise Videos">
      <ExerciseLibraryView />
    </ClientShell>
  )
}
