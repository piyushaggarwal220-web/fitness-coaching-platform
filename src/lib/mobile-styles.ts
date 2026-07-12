/** Shared mobile-first styles — premium dark theme */

import type { CSSProperties } from 'react'
import { colors, spacing, radius, layout, shadows, typography } from './design-tokens'

export const MOBILE_BREAKPOINT = 768

export const mobileStyles = {
  page: {
    minHeight: '100vh',
    backgroundColor: colors.bgPrimary,
    padding: `${spacing[3]}px`,
    paddingTop: `calc(${layout.topBarHeight}px + ${spacing[3]}px)`,
    paddingBottom: `calc(${layout.bottomNavHeight}px + ${spacing[3]}px + env(safe-area-inset-bottom))`,
  } satisfies CSSProperties,

  pageNoNav: {
    minHeight: '100vh',
    backgroundColor: colors.bgPrimary,
    padding: `${spacing[3]}px`,
    paddingBottom: `max(${spacing[3]}px, env(safe-area-inset-bottom))`,
  } satisfies CSSProperties,

  container: {
    maxWidth: layout.maxWidthWide,
    margin: '0 auto',
    width: '100%',
  } satisfies CSSProperties,

  card: {
    backgroundColor: colors.bgCard,
    borderRadius: radius.md,
    padding: `${spacing[4]}px`,
    marginBottom: spacing[3],
    border: `1px solid ${colors.borderSubtle}`,
  } satisfies CSSProperties,

  glassCard: {
    backgroundColor: colors.bgGlass,
    backdropFilter: 'blur(20px)',
    WebkitBackdropFilter: 'blur(20px)',
    borderRadius: radius.md,
    padding: `${spacing[4]}px`,
    marginBottom: spacing[3],
    border: `1px solid ${colors.borderSubtle}`,
  } satisfies CSSProperties,

  title: typography.pageTitle,
  sectionTitle: typography.sectionTitle,
  subtitle: typography.subtitle,

  primaryBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 56,
    minWidth: 56,
    padding: `${spacing[2]}px ${spacing[5]}px`,
    backgroundColor: colors.accent,
    color: colors.textInverse,
    border: 'none',
    borderRadius: radius.md,
    fontSize: 16,
    fontWeight: 600,
    cursor: 'pointer',
    textDecoration: 'none',
    touchAction: 'manipulation',
    boxShadow: shadows.accent,
    transition: 'transform 150ms ease, opacity 150ms ease',
  } satisfies CSSProperties,

  secondaryBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 56,
    minWidth: 56,
    padding: `${spacing[2]}px ${spacing[5]}px`,
    backgroundColor: colors.bgElevated,
    color: colors.textPrimary,
    border: `1px solid ${colors.borderSubtle}`,
    borderRadius: radius.md,
    fontSize: 16,
    fontWeight: 600,
    cursor: 'pointer',
    textDecoration: 'none',
    touchAction: 'manipulation',
    transition: 'transform 150ms ease, opacity 150ms ease',
  } satisfies CSSProperties,

  input: {
    width: '100%',
    minHeight: 56,
    padding: `${spacing[2]}px ${spacing[3]}px`,
    border: `1px solid ${colors.borderSubtle}`,
    borderRadius: radius.sm,
    fontSize: 16,
    boxSizing: 'border-box' as const,
    backgroundColor: colors.bgElevated,
    color: colors.textPrimary,
    outline: 'none',
  } satisfies CSSProperties,

  stickyBottom: {
    position: 'fixed' as const,
    bottom: `calc(${layout.bottomNavHeight}px + env(safe-area-inset-bottom))`,
    left: 0,
    right: 0,
    padding: `${spacing[3]}px`,
    backgroundColor: colors.bgGlass,
    backdropFilter: 'blur(20px)',
    WebkitBackdropFilter: 'blur(20px)',
    borderTop: `1px solid ${colors.divider}`,
    zIndex: 90,
  } satisfies CSSProperties,

  empty: {
    textAlign: 'center' as const,
    padding: `${spacing[7]}px ${spacing[5]}px`,
    color: colors.textMuted,
  } satisfies CSSProperties,

  loading: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: 200,
    color: colors.textSecondary,
    fontSize: 16,
  } satisfies CSSProperties,

  error: {
    backgroundColor: colors.dangerMuted,
    color: colors.danger,
    padding: `${spacing[2]}px ${spacing[3]}px`,
    borderRadius: radius.sm,
    marginBottom: spacing[3],
    fontSize: 14,
    border: `1px solid rgba(239, 68, 68, 0.2)`,
  } satisfies CSSProperties,

  success: {
    backgroundColor: colors.successMuted,
    color: colors.success,
    padding: `${spacing[2]}px ${spacing[3]}px`,
    borderRadius: radius.sm,
    marginBottom: spacing[3],
    fontSize: 14,
    border: `1px solid rgba(34, 197, 94, 0.2)`,
  } satisfies CSSProperties,

  info: {
    backgroundColor: colors.accentMuted,
    color: colors.accent,
    padding: `${spacing[3]}px`,
    borderRadius: radius.sm,
    marginBottom: spacing[3],
    fontSize: 14,
    border: `1px solid rgba(52, 211, 153, 0.2)`,
  } satisfies CSSProperties,
}

export const mobileNavStyles = `
  .mobile-nav-links { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
  .mobile-nav-btn { display: none; background: none; border: none; color: var(--text-primary); cursor: pointer; min-width: 48px; min-height: 48px; border-radius: 12px; }
  @media (max-width: 767px) {
    .mobile-nav-links { display: none; flex-direction: column; width: 100%; margin-top: 12px; gap: 4px; align-items: stretch; background: var(--bg-card); border-radius: 16px; padding: 8px; }
    .mobile-nav-links.open { display: flex; }
    .mobile-nav-btn { display: flex; align-items: center; justify-content: center; }
    .mobile-nav-links a, .mobile-nav-links button { padding: 12px 16px !important; min-height: 48px; border-radius: 12px; }
  }
`
