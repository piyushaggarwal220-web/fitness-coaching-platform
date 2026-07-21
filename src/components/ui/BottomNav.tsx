'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, Map, ClipboardList, MessageCircle, ListChecks } from 'lucide-react'
import { colors, layout, spacing } from '@/lib/design-tokens'

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Home', icon: Home },
  { href: '/tracker', label: 'Tracker', icon: ListChecks },
  { href: '/plan', label: 'Plan', icon: ClipboardList },
  { href: '/client/chat', label: 'Chat', icon: MessageCircle },
  { href: '/journey', label: 'Journey', icon: Map },
] as const

export function BottomNav({ unreadChats = 0 }: { unreadChats?: number }) {
  const pathname = usePathname()

  return (
    <nav
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        height: `calc(${layout.bottomNavHeight}px + env(safe-area-inset-bottom))`,
        paddingBottom: 'env(safe-area-inset-bottom)',
        backgroundColor: colors.bgGlass,
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderTop: `1px solid ${colors.divider}`,
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-around',
        maxWidth: layout.maxWidthWide,
        margin: '0 auto',
      }}
      aria-label="Main navigation"
    >
      {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
        const active = pathname === href || (href !== '/dashboard' && pathname.startsWith(href))
        return (
          <Link
            key={href}
            href={href}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 4,
              minWidth: 56,
              minHeight: 56,
              padding: `${spacing[1]}px`,
              color: active ? colors.accent : colors.textMuted,
              textDecoration: 'none',
              transition: 'color 150ms ease',
            }}
            aria-current={active ? 'page' : undefined}
          >
            <span style={{ position: 'relative', display: 'flex' }}>
              <Icon size={22} strokeWidth={active ? 2.5 : 2} />
              {href === '/client/chat' && unreadChats > 0 && (
                <span style={{
                  position: 'absolute',
                  top: -8,
                  right: -12,
                  minWidth: 17,
                  height: 17,
                  padding: '0 4px',
                  borderRadius: 999,
                  backgroundColor: colors.accent,
                  color: colors.textInverse,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 9,
                  fontWeight: 700,
                }}>
                  {unreadChats > 9 ? '9+' : unreadChats}
                </span>
              )}
            </span>
            <span style={{ fontSize: 11, fontWeight: active ? 600 : 500 }}>{label}</span>
          </Link>
        )
      })}
    </nav>
  )
}
