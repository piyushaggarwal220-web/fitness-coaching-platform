'use client'

import type { ReactNode } from 'react'
import { InstantFeatureGate } from '@/components/instant/InstantFeatureGate'

/** Check-ins are part of the Instant tracker unlock. */
export default function CheckinLayout({ children }: { children: ReactNode }) {
  return (
    <InstantFeatureGate feature="tracker" title="Check-In">
      {children}
    </InstantFeatureGate>
  )
}
