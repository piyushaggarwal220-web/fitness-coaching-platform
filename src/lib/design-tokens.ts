/** Design tokens for inline styles — mirrors globals.css variables */

import type { CSSProperties } from 'react'

export const colors = {
  bgPrimary: '#09090b',
  bgSecondary: '#111113',
  bgCard: '#18181b',
  bgElevated: '#1f1f23',
  bgGlass: 'rgba(24, 24, 27, 0.72)',
  accent: '#f97316',
  accentHover: '#fb923c',
  accentMuted: 'rgba(249, 115, 22, 0.12)',
  accentGlow: 'rgba(249, 115, 22, 0.22)',
  success: '#22c55e',
  successMuted: 'rgba(34, 197, 94, 0.12)',
  warning: '#f59e0b',
  warningMuted: 'rgba(245, 158, 11, 0.12)',
  danger: '#ef4444',
  dangerMuted: 'rgba(239, 68, 68, 0.12)',
  textPrimary: '#fafafa',
  textSecondary: '#c4c4cc',
  textMuted: '#a1a1aa',
  textInverse: '#09090b',
  divider: 'rgba(255, 255, 255, 0.06)',
  borderSubtle: 'rgba(255, 255, 255, 0.08)',
} as const

/** Light theme — coach portal only (client/admin stay on dark `colors`). */
export const coachColors = {
  bgPrimary: '#ffffff',
  bgSecondary: '#f4f4f5',
  bgCard: '#ffffff',
  bgElevated: '#f4f4f5',
  bgGlass: 'rgba(255, 255, 255, 0.92)',
  accent: '#ea580c',
  accentHover: '#f97316',
  accentMuted: 'rgba(234, 88, 12, 0.1)',
  accentGlow: 'rgba(234, 88, 12, 0.16)',
  success: '#16a34a',
  successMuted: 'rgba(22, 163, 74, 0.12)',
  warning: '#d97706',
  warningMuted: 'rgba(217, 119, 6, 0.12)',
  danger: '#dc2626',
  dangerMuted: 'rgba(220, 38, 38, 0.1)',
  textPrimary: '#18181b',
  textSecondary: '#3f3f46',
  textMuted: '#71717a',
  textInverse: '#ffffff',
  divider: 'rgba(24, 24, 27, 0.08)',
  borderSubtle: 'rgba(24, 24, 27, 0.12)',
} as const

export const spacing = {
  1: 8,
  2: 12,
  3: 16,
  4: 20,
  5: 24,
  6: 32,
  7: 48,
} as const

export const radius = {
  sm: 12,
  md: 16,
  lg: 20,
  xl: 24,
  full: 9999,
} as const

export const layout = {
  bottomNavHeight: 72,
  topBarHeight: 56,
  maxWidth: 480,
  maxWidthWide: 800,
} as const

export const shadows = {
  sm: '0 1px 2px rgba(0, 0, 0, 0.3)',
  md: '0 4px 16px rgba(0, 0, 0, 0.4)',
  lg: '0 8px 32px rgba(0, 0, 0, 0.5)',
  accent: '0 4px 20px rgba(249, 115, 22, 0.22)',
} as const

export const motion = {
  duration: {
    fast: 120,
    normal: 180,
    medium: 250,
    slow: 350,
  },
  easing: {
    standard: 'cubic-bezier(0.4, 0, 0.2, 1)',
    out: 'cubic-bezier(0.16, 1, 0.3, 1)',
    drawer: 'cubic-bezier(0.32, 0.72, 0, 1)',
  },
} as const

export function transition(
  speed: keyof typeof motion.duration = 'normal',
  properties = 'all',
): string {
  return `${properties} ${motion.duration[speed]}ms ${motion.easing.standard}`
}

export const typography = {
  pageTitle: {
    fontSize: 'clamp(1.75rem, 6vw, 2.25rem)',
    fontWeight: 800,
    color: colors.textPrimary,
    margin: 0,
    letterSpacing: '-0.02em',
    lineHeight: 1.15,
  } satisfies CSSProperties,
  sectionTitle: {
    fontSize: 'var(--text-lg)',
    fontWeight: 700,
    color: colors.textPrimary,
    margin: '0 0 var(--space-2)',
    letterSpacing: '-0.01em',
  } satisfies CSSProperties,
  subtitle: {
    fontSize: 'var(--text-base)',
    color: colors.textSecondary,
    margin: '0 0 var(--space-4)',
    lineHeight: 1.5,
  } satisfies CSSProperties,
  label: {
    fontSize: 'var(--text-sm)',
    fontWeight: 500,
    color: colors.textSecondary,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
  } satisfies CSSProperties,
  body: {
    fontSize: 'var(--text-base)',
    color: colors.textPrimary,
    lineHeight: 1.6,
  } satisfies CSSProperties,
  caption: {
    fontSize: 'var(--text-sm)',
    color: colors.textMuted,
  } satisfies CSSProperties,
}
