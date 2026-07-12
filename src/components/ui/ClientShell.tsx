'use client'

import type { ReactNode } from 'react'
import { BottomNav } from './BottomNav'
import { TopBar } from './TopBar'
import { mobileStyles } from '@/lib/mobile-styles'

type ClientShellProps = {
  children?: ReactNode
  title?: string
  hideBottomNav?: boolean
  hideTopBar?: boolean
  loading?: boolean
}

export function ClientShell({ children, title, hideBottomNav = false, hideTopBar = false, loading }: ClientShellProps) {
  if (loading) {
    return (
      <>
        {!hideTopBar && <TopBar title={title} />}
        <div style={hideBottomNav ? mobileStyles.pageNoNav : mobileStyles.page}>
          <div className="skeleton" style={{ height: 32, width: '60%', borderRadius: 12, marginBottom: 16 }} />
          <div className="skeleton" style={{ height: 120, borderRadius: 16, marginBottom: 12 }} />
          <div className="skeleton" style={{ height: 120, borderRadius: 16, marginBottom: 12 }} />
          <div className="skeleton" style={{ height: 80, borderRadius: 16 }} />
        </div>
        {!hideBottomNav && <BottomNav />}
      </>
    )
  }

  return (
    <>
      {!hideTopBar && <TopBar title={title} />}
      <main style={hideBottomNav ? mobileStyles.pageNoNav : mobileStyles.page}>
        <div style={mobileStyles.container} className="animate-fade-in">
          {children}
        </div>
      </main>
      {!hideBottomNav && <BottomNav />}
    </>
  )
}

/** @deprecated Use ClientShell instead — kept for public/unauthenticated pages */
export { TopBar, BottomNav }
