'use client'

import { TrackerHub } from '@/components/tracker/hub/TrackerHub'
import { useTracker } from '@/components/tracker/context/TrackerContext'
import { ClientShell } from '@/components/ui/ClientShell'
import { EmptyState } from '@/components/ui/EmptyState'
import { colors } from '@/lib/design-tokens'
import { ClipboardList } from 'lucide-react'
import { useRouter } from 'next/navigation'

export default function TrackerPage() {
  const router = useRouter()
  const { loading, error, view } = useTracker()

  if (loading) {
    return <ClientShell title="Log today" loading />
  }

  if (error && !view) {
    return (
      <ClientShell title="Log today">
        <EmptyState
          icon={<ClipboardList size={40} color={colors.accent} />}
          title="Nothing to log yet"
          description={error || 'Open your plan first. Daily logging appears once your diet and workout are ready.'}
          actionLabel="Open plan"
          onAction={() => router.push('/plan')}
        />
      </ClientShell>
    )
  }

  if (!view) {
    return <ClientShell title="Log today" loading />
  }

  return (
    <ClientShell title="Log today">
      <TrackerHub view={view} />
    </ClientShell>
  )
}
