'use client'

import { type ReactNode } from 'react'
import { ClientShell } from '@/components/ui/ClientShell'
import { InstantFeatureLockedPanel } from '@/components/instant/InstantFeatureLockedPanel'
import { useInstantLockState } from '@/hooks/useInstantLockState'
import type { InstantFeature } from '@/lib/instant-feature-access'

type Props = {
  feature: InstantFeature
  title: string
  children: ReactNode
}

/** Client-side gate for Instant-only locked surfaces. */
export function InstantFeatureGate({ feature, title, children }: Props) {
  const { loading, locked } = useInstantLockState()

  if (loading) {
    return <ClientShell title={title} loading />
  }
  if (locked[feature]) {
    return (
      <ClientShell title={title}>
        <InstantFeatureLockedPanel feature={feature} />
      </ClientShell>
    )
  }
  return <>{children}</>
}
