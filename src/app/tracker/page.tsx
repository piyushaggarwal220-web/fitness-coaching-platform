'use client'

import { TrackerHub } from '@/components/tracker/hub/TrackerHub'
import { TrackerDateSelector } from '@/components/tracker/TrackerDateSelector'
import { useTracker } from '@/components/tracker/context/TrackerContext'
import { ClientShell } from '@/components/ui/ClientShell'
import { EmptyState } from '@/components/ui/EmptyState'
import { colors } from '@/lib/design-tokens'
import { ClipboardList } from 'lucide-react'
import { useRouter } from 'next/navigation'

export default function TrackerPage() {
  const router = useRouter()
  const { loading, error, view, saving, selectedDate, setSelectedDate } = useTracker()

  if (loading) {
    return <ClientShell title="Tracker" loading />
  }

  if (error && !view) {
    return (
      <ClientShell title="Tracker">
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
      <TrackerDateSelector
        value={selectedDate}
        min={view.dateNavigation.minDate}
        max={view.dateNavigation.maxDate}
        disabled={saving}
        onChange={setSelectedDate}
      />
      <TrackerHub view={view} />
    </ClientShell>
  )
}
