'use client'

import { TrackerHub } from '@/components/tracker/hub/TrackerHub'
import { TrackerRefreshControls } from '@/components/tracker/TrackerRefreshControls'
import { useTracker } from '@/components/tracker/context/TrackerContext'
import { ClientShell } from '@/components/ui/ClientShell'
import { EmptyState } from '@/components/ui/EmptyState'
import { colors, spacing } from '@/lib/design-tokens'
import { ClipboardList } from 'lucide-react'
import { useRouter } from 'next/navigation'

export default function TrackerPage() {
  const router = useRouter()
  const { loading, error, view } = useTracker()

  if (loading) {
    return <ClientShell title="Tracker" loading />
  }

  if (error && !view) {
    return (
      <ClientShell title="Tracker">
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: spacing[3] }}>
          <TrackerRefreshControls />
        </div>
        <EmptyState
          icon={<ClipboardList size={40} color={colors.accent} />}
          title="Tracker not ready"
          description={error}
          actionLabel="View plan"
          onAction={() => router.push('/plan')}
        />
      </ClientShell>
    )
  }

  if (!view) {
    return <ClientShell title="Tracker" loading />
  }

  return (
    <ClientShell title="Tracker">
      <TrackerHub view={view} />
    </ClientShell>
  )
}
