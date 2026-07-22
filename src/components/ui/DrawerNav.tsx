'use client'

import { useEffect, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { X } from 'lucide-react'
import { colors as darkColors, spacing } from '@/lib/design-tokens'
import { colors as lightColors } from '@/lib/coach-theme'
import { staggerClass } from '@/lib/motion'

export type DrawerNavItem = {
  href: string
  label: string
  icon: ReactNode
  badge?: number
}

type DrawerNavProps = {
  open: boolean
  onClose: () => void
  items: DrawerNavItem[]
  title: string
  subtitle?: string
  theme?: 'dark' | 'light'
}

export function DrawerNav({ open, onClose, items, title, subtitle, theme = 'dark' }: DrawerNavProps) {
  const pathname = usePathname()
  const [mounted, setMounted] = useState(false)
  const [visible, setVisible] = useState(false)
  const colors = theme === 'light' ? lightColors : darkColors

  useEffect(() => {
    if (open) {
      setMounted(true)
      requestAnimationFrame(() => setVisible(true))
    } else if (mounted) {
      setVisible(false)
    }
  }, [open, mounted])

  useEffect(() => {
    if (!mounted) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [mounted, onClose])

  useEffect(() => {
    if (!mounted) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [mounted])

  useEffect(() => {
    if (!visible && mounted) {
      const timer = setTimeout(() => setMounted(false), 360)
      return () => clearTimeout(timer)
    }
  }, [visible, mounted])

  if (!mounted) return null

  return (
    <div
      className={`drawer-overlay ${visible ? '' : 'drawer-overlay--closing'}`}
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
          backgroundColor: theme === 'light' ? 'rgba(24,24,27,0.35)' : 'rgba(0,0,0,0.55)',
          backdropFilter: 'blur(4px)',
          cursor: 'pointer',
        }}
      />
      <nav
        className={`drawer-panel safe-top safe-bottom ${visible ? '' : 'drawer-panel--closing'}`}
        style={{
          width: 'min(320px, 85vw)',
          backgroundColor: colors.bgSecondary,
          borderRight: `1px solid ${colors.divider}`,
          boxShadow: theme === 'light' ? '8px 0 40px rgba(24,24,27,0.12)' : '8px 0 40px rgba(0,0,0,0.45)',
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
            className="btn-press"
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
          {items.map((item, index) => {
            const active = pathname === item.href || (item.href !== '/dashboard' && item.href !== '/coach/dashboard' && item.href !== '/admin' && pathname.startsWith(item.href))
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onClose}
                className={`drawer-item-cascade ${staggerClass(index)}`}
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
                  transition: 'background-color 180ms ease, color 180ms ease',
                }}
              >
                <span style={{ color: active ? colors.accent : colors.textMuted, display: 'flex' }}>{item.icon}</span>
                <span style={{ flex: 1 }}>{item.label}</span>
                {Boolean(item.badge) && (
                  <span style={{
                    minWidth: 22,
                    height: 22,
                    padding: '0 7px',
                    borderRadius: 999,
                    backgroundColor: colors.accent,
                    color: colors.textInverse,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 11,
                    fontWeight: 700,
                  }}>
                    {item.badge! > 99 ? '99+' : item.badge}
                  </span>
                )}
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

export function DrawerMenuButton({
  onClick,
  label = 'Open menu',
  theme = 'dark',
}: {
  onClick: () => void
  label?: string
  theme?: 'dark' | 'light'
}) {
  const palette = theme === 'light' ? lightColors : darkColors
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="btn-press"
      style={{
        width: 40,
        height: 40,
        borderRadius: 12,
        border: `1px solid ${palette.borderSubtle}`,
        backgroundColor: palette.bgElevated,
        color: palette.textPrimary,
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
  ListChecks: React.ComponentType<{ size?: number; color?: string }>
  MessageCircle: React.ComponentType<{ size?: number; color?: string }>
  Trophy: React.ComponentType<{ size?: number; color?: string }>
  User: React.ComponentType<{ size?: number; color?: string }>
  Settings: React.ComponentType<{ size?: number; color?: string }>
  LifeBuoy: React.ComponentType<{ size?: number; color?: string }>
}): DrawerNavItem[] => [
  { href: '/dashboard', label: 'Dashboard', icon: <icons.Home size={20} /> },
  { href: '/tracker', label: "Today's Tracker", icon: <icons.ListChecks size={20} /> },
  { href: '/league', label: 'League', icon: <icons.Trophy size={20} /> },
  { href: '/journey', label: 'Journey', icon: <icons.Map size={20} /> },
  { href: '/plan', label: 'My Plan', icon: <icons.ClipboardList size={20} /> },
  { href: '/checkin', label: 'Check-ins', icon: <icons.Calendar size={20} /> },
  { href: '/client/chat', label: 'Chat', icon: <icons.MessageCircle size={20} /> },
  { href: '/profile', label: 'Profile', icon: <icons.User size={20} /> },
  { href: '/settings', label: 'Settings', icon: <icons.Settings size={20} /> },
  { href: '/client/support', label: 'Support', icon: <icons.LifeBuoy size={20} /> },
]
