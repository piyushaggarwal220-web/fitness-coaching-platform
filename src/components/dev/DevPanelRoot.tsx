'use client'

import dynamic from 'next/dynamic'

const DevPanel = dynamic(() => import('./DevPanel'), { ssr: false })

export function DevPanelRoot() {
  return <DevPanel />
}
