'use client'

import { useEffect, useState, type CSSProperties } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  BarChart3,
  ClipboardList,
  Dumbbell,
  LayoutDashboard,
  ListOrdered,
  MessageCircle,
  User,
  Users,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { User as SupabaseUser } from '@supabase/supabase-js'
import { NotificationBell } from '@/components/notifications/NotificationBell'
import { DrawerNav, type DrawerNavItem, DrawerMenuButton } from '@/components/ui/DrawerNav'
import { isDevToolkitEnabledClient } from '@/lib/dev-mode'
import { BRAND_COACH_LABEL, BRAND_NAME } from '@/lib/brand'
import { colors, spacing } from '@/lib/design-tokens'

const supabase = createClient()

const COACH_DRAWER_ITEMS: DrawerNavItem[] = [
  { href: '/coach/dashboard', label: 'Dashboard', icon: <LayoutDashboard size={20} /> },
  { href: '/coach/clients', label: 'Clients', icon: <Users size={20} /> },
  { href: '/coach/queue', label: 'Queue', icon: <ListOrdered size={20} /> },
  { href: '/coach/chat', label: 'Chats', icon: <MessageCircle size={20} /> },
  { href: '/coach/checkins', label: 'Check-ins', icon: <ClipboardList size={20} /> },
  { href: '/coach/exercises', label: 'Exercise Videos', icon: <Dumbbell size={20} /> },
  { href: '/coach/analytics', label: 'Analytics', icon: <BarChart3 size={20} /> },
  { href: '/coach/dashboard', label: 'Profile', icon: <User size={20} /> },
]

type CoachNavbarProps = {
  onMenuClick?: () => void
}

export default function CoachNavbar({ onMenuClick }: CoachNavbarProps) {
  const router = useRouter()
  const [user, setUser] = useState<SupabaseUser | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)

  useEffect(() => {
    const getUser = async () => {
      const { data } = await supabase.auth.getUser()
      setUser(data.user)
    }
    void getUser()
  }, [])

  const openDrawer = () => {
    if (onMenuClick) onMenuClick()
    else setDrawerOpen(true)
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/')
  }

  const items: DrawerNavItem[] = [
    ...COACH_DRAWER_ITEMS,
    ...(isDevToolkitEnabledClient()
      ? [{ href: '/admin/dev-tools', label: 'Dev Tools', icon: <BarChart3 size={20} /> }]
      : []),
  ]

  return (
    <>
      <nav style={styles.navbar}>
        <div style={styles.container}>
          <div style={{ display: 'flex', alignItems: 'center', gap: spacing[2] }}>
            <DrawerMenuButton onClick={openDrawer} />
            <Link href="/coach/dashboard" style={styles.logo}>{BRAND_COACH_LABEL}</Link>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            {user && <NotificationBell />}
            <button type="button" onClick={() => void handleLogout()} style={styles.logoutCompact}>
              Logout
            </button>
          </div>
        </div>
      </nav>
      <DrawerNav
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        items={items}
        title={`${BRAND_NAME} Coach`}
        subtitle="Work queue & clients"
      />
    </>
  )
}

const styles: Record<string, CSSProperties> = {
  navbar: {
    backgroundColor: colors.bgGlass,
    backdropFilter: 'blur(20px)',
    WebkitBackdropFilter: 'blur(20px)',
    padding: `${spacing[2]}px ${spacing[3]}px`,
    paddingTop: `calc(${spacing[2]}px + env(safe-area-inset-top))`,
    borderBottom: `1px solid ${colors.divider}`,
    position: 'sticky',
    top: 0,
    zIndex: 100,
  },
  container: { maxWidth: 1200, margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  logo: { color: colors.textPrimary, fontSize: 'clamp(16px, 4vw, 20px)', fontWeight: 800, textDecoration: 'none', letterSpacing: '-0.02em' },
  logoutCompact: {
    backgroundColor: colors.bgElevated,
    color: colors.textSecondary,
    border: `1px solid ${colors.borderSubtle}`,
    padding: '8px 14px',
    borderRadius: 12,
    cursor: 'pointer',
    fontSize: 13,
    minHeight: 40,
    fontWeight: 600,
  },
}
