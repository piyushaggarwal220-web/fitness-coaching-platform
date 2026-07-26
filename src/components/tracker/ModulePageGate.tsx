'use client'

import { type ReactNode } from 'react'
import { EmptyState } from '@/components/ui/EmptyState'
import { useTracker } from '@/components/tracker/context/TrackerContext'
import { ModuleEmpty, ModuleShell } from '@/components/tracker/ModuleShell'
import { TrackerDateSelector } from '@/components/tracker/TrackerDateSelector'
import { colors } from '@/lib/design-tokens'
import { ClipboardList } from 'lucide-react'
import { useRouter } from 'next/navigation'

export function TrackerModulePage({
  title,
  children,
  emptyMessage,
  isAvailable,
}: {
  title: string
  children: ReactNode
  emptyMessage: string
  isAvailable: boolean
}) {
  const router = useRouter()
  const { loading, error, view, saving, selectedDate, setSelectedDate } = useTracker()
  const dateSelector = view ? (
    <TrackerDateSelector
      value={selectedDate}
      min={view.dateNavigation.minDate}
      max={view.dateNavigation.maxDate}
      disabled={saving}
      onChange={setSelectedDate}
    />
  ) : null

  if (loading) {
    return <ModuleShell title={title} loading />
  }

  if (error && !view) {
    return (
      <ModuleShell title={title}>
        {dateSelector}
        <EmptyState
          icon={<ClipboardList size={40} color={colors.accent} />}
          title="Tracker not ready"
          description={error}
          actionLabel="View plan"
          onAction={() => router.push('/plan')}
        />
      </ModuleShell>
    )
  }

  if (!isAvailable) {
    return (
      <ModuleShell title={title}>
        {dateSelector}
        <ModuleEmpty message={emptyMessage} />
      </ModuleShell>
    )
  }

  return (
    <ModuleShell title={title}>
      {dateSelector}
      {children}
    </ModuleShell>
  )
}
