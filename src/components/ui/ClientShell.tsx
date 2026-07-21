'use client'

import { useEffect, useState, type ReactNode } from 'react'
import {
  Calendar,
  ClipboardList,
  Home,
  LifeBuoy,
  ListChecks,
  Map,
  MessageCircle,
  Settings,
  Trophy,
  User,
} from 'lucide-react'
import { BottomNav } from './BottomNav'
import { TopBar } from './TopBar'
import { clientDrawerItems, DrawerMenuButton, DrawerNav } from './DrawerNav'
import { BRAND_NAME } from '@/lib/brand'
import { PageTransition } from '@/components/motion/PageTransition'
import { layout } from '@/lib/design-tokens'
import { mobileStyles } from '@/lib/mobile-styles'
import { useChatUnreadCount } from '@/hooks/useSupabaseRealtime'
import { NotificationActivationGate } from '@/components/notifications/PushNotificationActivation'

type ClientShellProps = {
  children?: ReactNode
  title?: string
  hideBottomNav?: boolean
  hideTopBar?: boolean
  loading?: boolean
  loadingMessage?: string
  /** Full viewport height for chat — no page padding, fixed layout */
  fullHeight?: boolean
}

const baseDrawerItems = clientDrawerItems({
  Home,
  Map,
  ClipboardList,
  Calendar,
  ListChecks,
  MessageCircle,
  Trophy,
  User,
  Settings,
  LifeBuoy,
})

export function ClientShell({ children, title, hideBottomNav = false, hideTopBar = false, loading, loadingMessage, fullHeight = false }: ClientShellProps) {
  const [drawerOpen, setDrawerOpen] = useState(false)
  const unreadChats = useChatUnreadCount('client')
  const drawerItems = baseDrawerItems.map((item) => (
    item.href === '/client/chat' ? { ...item, badge: unreadChats } : item
  ))

  const mainStyle = fullHeight
    ? {
        position: 'fixed' as const,
        top: hideTopBar
          ? 'env(safe-area-inset-top, 0px)'
          : `calc(${layout.topBarHeight}px + env(safe-area-inset-top, 0px))`,
        left: 0,
        right: 0,
        bottom: 'var(--chat-vv-offset, 0px)',
        display: 'flex',
        flexDirection: 'column' as const,
        overflow: 'hidden',
        backgroundColor: 'var(--bg-primary)',
        zIndex: 50,
        maxWidth: layout.maxWidthWide,
        margin: '0 auto',
        minHeight: 0,
        width: '100%',
      }
    : (hideBottomNav ? mobileStyles.pageNoNav : mobileStyles.page)

  if (loading) {
    return (
      <>
        {!hideTopBar && <TopBar title={title} onMenuClick={() => setDrawerOpen(true)} />}
        <div style={hideBottomNav ? mobileStyles.pageNoNav : mobileStyles.page}>
          {loadingMessage ? (
            <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: 15, textAlign: 'center', paddingTop: 48 }}>
              {loadingMessage}
            </p>
          ) : (
            <>
              <div className="skeleton" style={{ height: 32, width: '60%', borderRadius: 12, marginBottom: 16 }} />
              <div className="skeleton" style={{ height: 120, borderRadius: 16, marginBottom: 12 }} />
              <div className="skeleton" style={{ height: 120, borderRadius: 16, marginBottom: 12 }} />
              <div className="skeleton" style={{ height: 80, borderRadius: 16 }} />
            </>
          )}
        </div>
        {!hideBottomNav && <BottomNav unreadChats={unreadChats} />}
        <DrawerNav open={drawerOpen} onClose={() => setDrawerOpen(false)} items={drawerItems} title="Menu" subtitle={`${BRAND_NAME} coaching hub`} />
      </>
    )
  }

  return (
    <>
      {!hideTopBar && <TopBar title={title} onMenuClick={() => setDrawerOpen(true)} />}
      <main style={mainStyle} className={fullHeight ? 'chat-main' : undefined}>
        {fullHeight ? children : (
          <PageTransition>
            <div style={mobileStyles.container}>
              {children}
            </div>
          </PageTransition>
        )}
      </main>
      {!hideBottomNav && !fullHeight && <BottomNav unreadChats={unreadChats} />}
      <DrawerNav open={drawerOpen} onClose={() => setDrawerOpen(false)} items={drawerItems} title="Menu" subtitle={`${BRAND_NAME} coaching hub`} />
      <NotificationActivationGate />
    </>
  )
}

export { DrawerMenuButton }
export { TopBar, BottomNav }
