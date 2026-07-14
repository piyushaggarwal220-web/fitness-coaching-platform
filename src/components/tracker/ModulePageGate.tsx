'use client'

import { type ReactNode } from 'react'
import { EmptyState } from '@/components/ui/EmptyState'
import { useTracker } from '@/components/tracker/context/TrackerContext'
import { ModuleEmpty, ModuleShell } from '@/components/tracker/ModuleShell'
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
  const { loading, error, view } = useTracker()

  if (loading) {
    return <ModuleShell title={title} loading />
  }

  if (error && !view) {
    return (
      <ModuleShell title={title}>
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
        <ModuleEmpty message={emptyMessage} />
      </ModuleShell>
    )
  }

  return <ModuleShell title={title}>{children}</ModuleShell>
}
