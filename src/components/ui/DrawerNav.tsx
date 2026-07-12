'use client'

import { useEffect, type ReactNode } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { X } from 'lucide-react'
import { colors, layout, spacing } from '@/lib/design-tokens'

export type DrawerNavItem = {
  href: string
  label: string
  icon: ReactNode
}

type DrawerNavProps = {
  open: boolean
  onClose: () => void
  items: DrawerNavItem[]
  title: string
  subtitle?: string
}

export function DrawerNav({ open, onClose, items, title, subtitle }: DrawerNavProps) {
  const pathname = usePathname()

  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [open])

  if (!open) return null

  return (
    <div
      className="drawer-overlay"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 200,
        display: 'flex',
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Navigation menu"
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Close menu"
        style={{
          flex: 1,
          border: 'none',
          backgroundColor: 'rgba(0,0,0,0.55)',
          backdropFilter: 'blur(4px)',
          cursor: 'pointer',
        }}
      />
      <nav
        className="drawer-panel safe-top safe-bottom"
        style={{
          width: 'min(320px, 85vw)',
          backgroundColor: colors.bgSecondary,
          borderRight: `1px solid ${colors.divider}`,
          boxShadow: '8px 0 40px rgba(0,0,0,0.45)',
          display: 'flex',
          flexDirection: 'column',
          padding: `${spacing[4]}px ${spacing[3]}px`,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: spacing[5] }}>
          <div>
            <p style={{ margin: 0, fontSize: 20, fontWeight: 800, color: colors.textPrimary, letterSpacing: '-0.02em' }}>{title}</p>
            {subtitle && (
              <p style={{ margin: '4px 0 0', fontSize: 13, color: colors.textMuted }}>{subtitle}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              width: 40,
              height: 40,
              borderRadius: 12,
              border: `1px solid ${colors.borderSubtle}`,
              backgroundColor: colors.bgElevated,
              color: colors.textSecondary,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
            }}
          >
            <X size={20} />
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1 }}>
          {items.map((item) => {
            const active = pathname === item.href || (item.href !== '/dashboard' && item.href !== '/coach/dashboard' && item.href !== '/admin' && pathname.startsWith(item.href))
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onClose}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: spacing[3],
                  padding: '14px 16px',
                  borderRadius: 14,
                  textDecoration: 'none',
                  color: active ? colors.textPrimary : colors.textSecondary,
                  backgroundColor: active ? colors.accentMuted : 'transparent',
                  border: active ? `1px solid rgba(249,115,22,0.2)` : '1px solid transparent',
                  fontWeight: active ? 600 : 500,
                  fontSize: 15,
                  minHeight: 48,
                  transition: 'background-color 150ms ease, color 150ms ease',
                }}
              >
                <span style={{ color: active ? colors.accent : colors.textMuted, display: 'flex' }}>{item.icon}</span>
                {item.label}
              </Link>
            )
          })}
        </div>

        <p style={{ margin: `${spacing[4]}px 0 0`, fontSize: 11, color: colors.textMuted, textAlign: 'center' }}>
          Premium coaching platform
        </p>
      </nav>
    </div>
  )
}

export function DrawerMenuButton({ onClick, label = 'Open menu' }: { onClick: () => void; label?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      style={{
        width: 40,
        height: 40,
        borderRadius: 12,
        border: `1px solid ${colors.borderSubtle}`,
        backgroundColor: colors.bgElevated,
        color: colors.textPrimary,
        fontSize: 18,
        fontWeight: 700,
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}
    >
      ☰
    </button>
  )
}

export const clientDrawerItems = (icons: {
  Home: React.ComponentType<{ size?: number; color?: string }>
  Map: React.ComponentType<{ size?: number; color?: string }>
  ClipboardList: React.ComponentType<{ size?: number; color?: string }>
  Calendar: React.ComponentType<{ size?: number; color?: string }>
  MessageCircle: React.ComponentType<{ size?: number; color?: string }>
  User: React.ComponentType<{ size?: number; color?: string }>
  Settings: React.ComponentType<{ size?: number; color?: string }>
  LifeBuoy: React.ComponentType<{ size?: number; color?: string }>
}): DrawerNavItem[] => [
  { href: '/dashboard', label: 'Dashboard', icon: <icons.Home size={20} /> },
  { href: '/journey', label: 'Journey', icon: <icons.Map size={20} /> },
  { href: '/plan', label: 'My Plan', icon: <icons.ClipboardList size={20} /> },
  { href: '/checkin', label: 'Check-ins', icon: <icons.Calendar size={20} /> },
  { href: '/client/chat', label: 'Chat', icon: <icons.MessageCircle size={20} /> },
  { href: '/profile', label: 'Profile', icon: <icons.User size={20} /> },
  { href: '/settings', label: 'Settings', icon: <icons.Settings size={20} /> },
  { href: '/client/support', label: 'Support', icon: <icons.LifeBuoy size={20} /> },
]
