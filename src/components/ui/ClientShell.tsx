'use client'

import { useEffect, useState, type ReactNode } from 'react'
import {
  Calendar,
  ClipboardList,
  Home,
  LifeBuoy,
  Map,
  MessageCircle,
  Settings,
  User,
} from 'lucide-react'
import { BottomNav } from './BottomNav'
import { TopBar } from './TopBar'
import { clientDrawerItems, DrawerMenuButton, DrawerNav } from './DrawerNav'
import { mobileStyles } from '@/lib/mobile-styles'

type ClientShellProps = {
  children?: ReactNode
  title?: string
  hideBottomNav?: boolean
  hideTopBar?: boolean
  loading?: boolean
  /** Full viewport height for chat — no page padding, fixed layout */
  fullHeight?: boolean
}

const drawerItems = clientDrawerItems({
  Home,
  Map,
  ClipboardList,
  Calendar,
  MessageCircle,
  User,
  Settings,
  LifeBuoy,
})

export function ClientShell({ children, title, hideBottomNav = false, hideTopBar = false, loading, fullHeight = false }: ClientShellProps) {
  const [drawerOpen, setDrawerOpen] = useState(false)

  const mainStyle = fullHeight
    ? {
        position: 'fixed' as const,
        top: hideTopBar ? 'env(safe-area-inset-top, 0px)' : `calc(56px + env(safe-area-inset-top, 0px))`,
        left: 0,
        right: 0,
        bottom: 'var(--chat-vv-offset, 0px)',
        display: 'flex',
        flexDirection: 'column' as const,
        overflow: 'hidden',
        backgroundColor: 'var(--bg-primary)',
        zIndex: 50,
      }
    : (hideBottomNav ? mobileStyles.pageNoNav : mobileStyles.page)

  if (loading) {
    return (
      <>
        {!hideTopBar && <TopBar title={title} onMenuClick={() => setDrawerOpen(true)} />}
        <div style={hideBottomNav ? mobileStyles.pageNoNav : mobileStyles.page}>
          <div className="skeleton" style={{ height: 32, width: '60%', borderRadius: 12, marginBottom: 16 }} />
          <div className="skeleton" style={{ height: 120, borderRadius: 16, marginBottom: 12 }} />
          <div className="skeleton" style={{ height: 120, borderRadius: 16, marginBottom: 12 }} />
          <div className="skeleton" style={{ height: 80, borderRadius: 16 }} />
        </div>
        {!hideBottomNav && <BottomNav />}
        <DrawerNav open={drawerOpen} onClose={() => setDrawerOpen(false)} items={drawerItems} title="Menu" subtitle="Your coaching hub" />
      </>
    )
  }

  return (
    <>
      {!hideTopBar && <TopBar title={title} onMenuClick={() => setDrawerOpen(true)} />}
      <main style={mainStyle} className={fullHeight ? 'chat-main' : undefined}>
        {fullHeight ? children : (
          <div style={mobileStyles.container} className="animate-fade-in">
            {children}
          </div>
        )}
      </main>
      {!hideBottomNav && !fullHeight && <BottomNav />}
      <DrawerNav open={drawerOpen} onClose={() => setDrawerOpen(false)} items={drawerItems} title="Menu" subtitle="Your coaching hub" />
    </>
  )
}

export { DrawerMenuButton }
export { TopBar, BottomNav }
