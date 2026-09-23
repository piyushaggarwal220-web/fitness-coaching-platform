import type { CSSProperties } from 'react'
import { colors, radius } from '@/lib/design-tokens'
import { JARVIS_ACCENT } from '@/lib/jarvis/operator-present'

export const accent = JARVIS_ACCENT

/** Shared tokens for secondary Jarvis 2.0 panels (palette, cards). Not for orb hero. */
export const j2 = {
  bg: '#070708',
  surface: 'rgba(17, 17, 19, 0.92)',
  surfaceSolid: '#111113',
  glass: 'rgba(255, 255, 255, 0.03)',
  glassBorder: 'rgba(255, 255, 255, 0.08)',
  amber: JARVIS_ACCENT,
  amberSoft: 'rgba(255, 98, 0, 0.18)',
  amberGlow: 'rgba(255, 98, 0, 0.22)',
  cyan: 'rgba(125, 211, 252, 0.85)',
  cyanSoft: 'rgba(125, 211, 252, 0.12)',
  text: '#f4f4f5',
  muted: 'rgba(161, 161, 170, 0.85)',
} as const

export const glassPanel: CSSProperties = {
  background: j2.surfaceSolid,
  border: `1px solid ${colors.borderSubtle}`,
  borderRadius: 8,
}

export const page: CSSProperties = {
  minHeight: '100vh',
  background: '#070708',
  color: colors.textPrimary,
}

export const topBar: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 16,
  height: 48,
  padding: '0 16px',
  borderBottom: `1px solid ${colors.borderSubtle}`,
  background: '#0a0a0c',
}

export const shell: CSSProperties = {
  display: 'flex',
  height: 'calc(100vh - 104px)',
  minHeight: 480,
  overflow: 'hidden',
}

export const sidebar: CSSProperties = {
  width: 196,
  flexShrink: 0,
  background: '#0b0b0d',
  borderRight: `1px solid ${colors.borderSubtle}`,
  display: 'flex',
  flexDirection: 'column',
  minHeight: 0,
}

export const main: CSSProperties = {
  flex: 1,
  minWidth: 0,
  display: 'flex',
  flexDirection: 'column',
  background: '#09090b',
}

export const brandMark: CSSProperties = {
  padding: '12px 14px 8px',
}

export const eyebrow: CSSProperties = {
  fontSize: 10,
  letterSpacing: '0.16em',
  color: colors.textMuted,
  fontWeight: 650,
  textTransform: 'uppercase',
}

export const brandTitle: CSSProperties = {
  margin: '2px 0 0',
  fontSize: 15,
  fontWeight: 750,
  letterSpacing: '-0.04em',
}

export const navSection: CSSProperties = {
  fontSize: 9,
  fontWeight: 650,
  letterSpacing: '0.14em',
  color: 'rgba(161,161,170,0.65)',
  textTransform: 'uppercase',
  margin: '10px 14px 2px',
}

export const navBtn = (active: boolean): CSSProperties => ({
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  width: '100%',
  textAlign: 'left',
  background: active ? 'rgba(255, 255, 255, 0.05)' : 'transparent',
  color: active ? colors.textPrimary : colors.textSecondary,
  border: 'none',
  borderLeft: active ? `2px solid ${accent}` : '2px solid transparent',
  borderRadius: 0,
  padding: '6px 12px',
  fontSize: 12,
  fontWeight: active ? 600 : 450,
  cursor: 'pointer',
})

export const ghostBtn: CSSProperties = {
  background: 'transparent',
  color: colors.textSecondary,
  border: `1px solid ${colors.borderSubtle}`,
  borderRadius: 8,
  padding: '6px 10px',
  fontSize: 12,
  cursor: 'pointer',
}

export const primaryBtn: CSSProperties = {
  background: 'transparent',
  color: accent,
  border: `1px solid rgba(255, 98, 0, 0.45)`,
  borderRadius: 8,
  padding: '8px 14px',
  fontWeight: 650,
  cursor: 'pointer',
  fontSize: 13,
}

export const solidBtn: CSSProperties = {
  background: accent,
  color: '#0a0a0a',
  border: 'none',
  borderRadius: 8,
  padding: '8px 14px',
  fontWeight: 700,
  cursor: 'pointer',
  fontSize: 13,
}

export const dangerBtn: CSSProperties = {
  background: 'transparent',
  color: colors.danger,
  border: `1px solid rgba(239, 68, 68, 0.28)`,
  borderRadius: 8,
  padding: '8px 14px',
  fontWeight: 650,
  cursor: 'pointer',
  fontSize: 13,
}

export const card: CSSProperties = {
  background: '#111113',
  border: `1px solid ${colors.borderSubtle}`,
  borderRadius: 8,
  padding: 16,
}

export const muted: CSSProperties = {
  fontSize: 12,
  color: colors.textMuted,
  marginTop: 4,
  lineHeight: 1.45,
}

export const input: CSSProperties = {
  width: '100%',
  background: '#101012',
  color: colors.textPrimary,
  border: `1px solid ${colors.borderSubtle}`,
  borderRadius: 8,
  padding: '8px 12px',
  fontSize: 13,
  fontFamily: 'inherit',
  boxSizing: 'border-box',
}

export const textarea: CSSProperties = {
  ...input,
  resize: 'none' as const,
  minHeight: 44,
  lineHeight: 1.45,
  fontSize: 14,
  padding: '10px 12px',
}

export const composerDock: CSSProperties = {
  padding: '6px 14px 8px',
  borderTop: `1px solid ${colors.divider}`,
  background: '#0c0c0e',
}

export const composerWrap: CSSProperties = {
  display: 'flex',
  gap: 8,
  alignItems: 'flex-end',
  background: '#101012',
  border: `1px solid ${colors.borderSubtle}`,
  borderRadius: 10,
  padding: 8,
}

export const badge = (tone: 'ok' | 'warn' | 'danger' | 'info' | 'muted' = 'muted'): CSSProperties => {
  const map = {
    ok: { bg: colors.successMuted, fg: colors.success },
    warn: { bg: colors.warningMuted, fg: colors.warning },
    danger: { bg: colors.dangerMuted, fg: colors.danger },
    info: { bg: 'rgba(255, 98, 0, 0.1)', fg: accent },
    muted: { bg: 'rgba(255,255,255,0.04)', fg: colors.textMuted },
  }[tone]
  return {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '2px 7px',
    borderRadius: 6,
    fontSize: 10,
    fontWeight: 650,
    letterSpacing: '0.04em',
    textTransform: 'uppercase' as const,
    background: map.bg,
    color: map.fg,
  }
}

export const sectionLabel: CSSProperties = {
  fontSize: 9,
  fontWeight: 650,
  letterSpacing: '0.14em',
  color: colors.textMuted,
  textTransform: 'uppercase',
  margin: '0 0 4px',
}

export const overlay: CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0,0,0,0.55)',
  zIndex: 80,
}

export const drawer: CSSProperties = {
  position: 'fixed',
  top: 56,
  left: 0,
  bottom: 0,
  width: 260,
  background: '#0b0b0d',
  borderRight: `1px solid ${colors.borderSubtle}`,
  zIndex: 90,
  display: 'flex',
  flexDirection: 'column',
}

export const sheet: CSSProperties = {
  position: 'fixed',
  left: 0,
  right: 0,
  bottom: 0,
  maxHeight: '78vh',
  background: '#0b0b0d',
  borderTop: `1px solid ${colors.borderSubtle}`,
  borderRadius: '12px 12px 0 0',
  zIndex: 90,
  display: 'flex',
  flexDirection: 'column',
}

export const statusDot = (tone: 'ok' | 'warn' | 'danger' | 'muted'): CSSProperties => ({
  width: 7,
  height: 7,
  borderRadius: radius.full,
  background:
    tone === 'ok' ? colors.success : tone === 'warn' ? colors.warning : tone === 'danger' ? colors.danger : colors.textMuted,
  boxShadow:
    tone === 'ok'
      ? '0 0 8px rgba(34,197,94,0.45)'
      : tone === 'danger'
        ? '0 0 8px rgba(239,68,68,0.4)'
        : undefined,
  display: 'inline-block',
  flexShrink: 0,
})
