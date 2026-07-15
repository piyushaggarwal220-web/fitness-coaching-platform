'use client'

import { CoachShell } from '@/components/ui/CoachShell'
import { ExerciseLibraryView } from '@/components/exercises/ExerciseLibraryView'
import { coachPageStyles as styles } from '@/lib/coach-page-styles'

export default function CoachExerciseLibraryPage() {
  return (
    <CoachShell>
      <h1 style={styles.title}>Exercise Videos</h1>
      <ExerciseLibraryView />
    </CoachShell>
  )
}
