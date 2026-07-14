'use client'

import { TrackerProvider } from '@/components/tracker/context/TrackerContext'
import type { ReactNode } from 'react'

export default function TrackerLayout({ children }: { children: ReactNode }) {
  return <TrackerProvider>{children}</TrackerProvider>
}
