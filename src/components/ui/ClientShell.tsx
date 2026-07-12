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

export function ClientShell({ children, title, hideBottomNav = false, hideTopBar = false, loading }: ClientShellProps) {
  const [drawerOpen, setDrawerOpen] = useState(false)

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
      <main style={hideBottomNav ? mobileStyles.pageNoNav : mobileStyles.page}>
        <div style={mobileStyles.container} className="animate-fade-in">
          {children}
        </div>
      </main>
      {!hideBottomNav && <BottomNav />}
      <DrawerNav open={drawerOpen} onClose={() => setDrawerOpen(false)} items={drawerItems} title="Menu" subtitle="Your coaching hub" />
    </>
  )
}

export { DrawerMenuButton }
export { TopBar, BottomNav }
