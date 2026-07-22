'use client'

import { CoachShell } from '@/components/ui/CoachShell'
import { brandTitle } from '@/lib/brand'
import { CoachWorkQueuePanel } from '@/components/coach/CoachWorkQueuePanel'
import { coachPageStyles as styles } from '@/lib/coach-page-styles'
import { colors } from '@/lib/coach-theme'

export default function CoachQueuePage() {
  return (
    <CoachShell>
      <h1 style={styles.title}>{brandTitle('Work Queue')}</h1>
      <p style={{ ...styles.subtitle, marginBottom: 24 }}>
        Prioritized tasks — complete each item to move to the next.
      </p>
      <CoachWorkQueuePanel />
      <div style={{ marginTop: 24, padding: 20, borderRadius: 16, backgroundColor: colors.bgCard, border: `1px solid ${colors.borderSubtle}` }}>
        <p style={{ margin: 0, fontSize: 14, color: colors.textMuted, lineHeight: 1.6 }}>
          Priority order: new clients awaiting plans → check-in reviews and call requests → unread messages → issue reports.
        </p>
      </div>
    </CoachShell>
  )
}
