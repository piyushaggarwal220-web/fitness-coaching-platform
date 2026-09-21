'use client'

import { TrackerProvider } from '@/components/tracker/context/TrackerContext'
import { InstantFeatureGate } from '@/components/instant/InstantFeatureGate'
import type { ReactNode } from 'react'

export default function TrackerLayout({ children }: { children: ReactNode }) {
  return (
    <InstantFeatureGate feature="tracker" title="Tracker">
      <TrackerProvider>{children}</TrackerProvider>
    </InstantFeatureGate>
  )
}
