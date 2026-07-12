'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { User } from '@supabase/supabase-js'
import { NotificationBell } from '@/components/notifications/NotificationBell'
import { DrawerMenuButton } from '@/components/ui/DrawerNav'
import { createClient } from '@/lib/supabase/client'
import { colors, layout, spacing } from '@/lib/design-tokens'

const supabase = createClient()

type TopBarProps = {
  title?: string
  showProfile?: boolean
  onMenuClick?: () => void
}

export function TopBar({ title, showProfile = true, onMenuClick }: TopBarProps) {
  const router = useRouter()
  const [user, setUser] = useState<User | null>(null)

  useEffect(() => {
    const getUser = async () => {
      const { data } = await supabase.auth.getUser()
      setUser(data.user)
    }
    void getUser()
  }, [])

  return (
    <header
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        height: `calc(${layout.topBarHeight}px + env(safe-area-inset-top))`,
        paddingTop: 'env(safe-area-inset-top)',
        backgroundColor: colors.bgGlass,
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderBottom: `1px solid ${colors.divider}`,
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: `0 ${spacing[3]}px`,
        maxWidth: layout.maxWidthWide,
        margin: '0 auto',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: spacing[2], minWidth: 0 }}>
        {onMenuClick && <DrawerMenuButton onClick={onMenuClick} />}
        {title ? (
          <h1 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: colors.textPrimary, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {title}
          </h1>
        ) : (
          <span style={{ fontSize: 17, fontWeight: 800, color: colors.accent, letterSpacing: '-0.02em' }}>
            Coach
          </span>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        {user && <NotificationBell />}
        {showProfile && user && (
          <button
            type="button"
            onClick={() => router.push('/profile')}
            aria-label="Profile"
            style={{
              width: 40,
              height: 40,
              borderRadius: '50%',
              backgroundColor: colors.accentMuted,
              border: `1px solid ${colors.borderSubtle}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: colors.accent,
              fontSize: 16,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            {(user.email?.[0] ?? 'U').toUpperCase()}
          </button>
        )}
        {!user && (
          <Link href="/login" style={{ fontSize: 14, fontWeight: 600, color: colors.accent, padding: '8px 12px' }}>
            Sign in
          </Link>
        )}
      </div>
    </header>
  )
}
