import type { CSSProperties } from 'react'
import { spacing, radius } from '@/lib/design-tokens'

/** Uses CSS variables so coach light theme (.coach-portal) and client dark theme both work. */
export const supportStyles: Record<string, CSSProperties> = {
  page: { minHeight: '100vh', backgroundColor: 'var(--bg-primary)' },
  container: { maxWidth: 960, margin: '0 auto', padding: `${spacing[4]}px ${spacing[3]}px`, paddingTop: `calc(56px + ${spacing[4]}px)`, paddingBottom: `calc(72px + ${spacing[4]}px)` },
  containerNarrow: { maxWidth: 720, margin: '0 auto', padding: `${spacing[4]}px ${spacing[3]}px`, paddingTop: `calc(56px + ${spacing[4]}px)`, paddingBottom: `calc(72px + ${spacing[4]}px)` },
  title: { margin: '0 0 6px 0', fontSize: 26, fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.02em' },
  subtitle: { margin: '0 0 24px 0', color: 'var(--text-secondary)', fontSize: 15 },
  backLink: { display: 'inline-block', color: 'var(--accent)', textDecoration: 'none', marginBottom: spacing[3], fontWeight: 600, fontSize: 14 },
  loading: { display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '50vh', color: 'var(--text-secondary)' },
  error: { backgroundColor: 'var(--danger-muted)', color: 'var(--danger)', padding: spacing[2], borderRadius: radius.sm, marginBottom: spacing[3], fontSize: 14 },
  success: { backgroundColor: 'var(--success-muted)', color: 'var(--success)', padding: spacing[2], borderRadius: radius.sm, marginBottom: spacing[3], fontSize: 14 },
  empty: { backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: radius.md, padding: 40, textAlign: 'center', color: 'var(--text-muted)' },
  card: { backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: radius.md, padding: spacing[4], marginBottom: spacing[2] },
  inboxList: { display: 'flex', flexDirection: 'column', gap: 10 },
  inboxItem: {
    display: 'block',
    backgroundColor: 'var(--bg-card)',
    border: '1px solid var(--border-subtle)',
    borderRadius: radius.md,
    padding: '16px 18px',
    textDecoration: 'none',
    color: 'inherit',
    transition: 'border-color 150ms ease',
  },
  inboxTitle: { margin: '0 0 4px 0', fontSize: 16, fontWeight: 600, color: 'var(--text-primary)' },
  inboxMeta: { fontSize: 13, color: 'var(--text-muted)', display: 'flex', flexWrap: 'wrap', gap: 8 },
  badge: { display: 'inline-block', padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600 },
  badgeOpen: { backgroundColor: 'var(--accent-muted)', color: 'var(--accent)' },
  badgeClaimed: { backgroundColor: 'var(--warning-muted)', color: 'var(--warning)' },
  badgeClosed: { backgroundColor: 'var(--bg-elevated)', color: 'var(--text-muted)' },
  badgeUrgent: { backgroundColor: 'var(--danger-muted)', color: 'var(--danger)' },
  badgeHigh: { backgroundColor: 'var(--warning-muted)', color: 'var(--warning)' },
  tabs: { display: 'flex', gap: 8, marginBottom: spacing[4], flexWrap: 'wrap' },
  tab: { padding: '10px 16px', borderRadius: radius.sm, border: '1px solid var(--border-subtle)', backgroundColor: 'var(--bg-elevated)', cursor: 'pointer', fontSize: 14, color: 'var(--text-secondary)', minHeight: 44 },
  tabActive: { padding: '10px 16px', borderRadius: radius.sm, border: '1px solid var(--accent)', backgroundColor: 'var(--accent-muted)', color: 'var(--accent)', cursor: 'pointer', fontSize: 14, fontWeight: 600, minHeight: 44 },
  thread: { display: 'flex', flexDirection: 'column', gap: 12, marginBottom: spacing[4] },
  bubbleClient: { alignSelf: 'flex-start', maxWidth: '85%', backgroundColor: 'var(--bg-elevated)', borderRadius: 16, padding: '12px 14px', fontSize: 14, lineHeight: 1.5, color: 'var(--text-primary)', border: '1px solid var(--border-subtle)' },
  bubbleCoach: { alignSelf: 'flex-end', maxWidth: '85%', backgroundColor: 'var(--accent-muted)', borderRadius: 16, padding: '12px 14px', fontSize: 14, lineHeight: 1.5, color: 'var(--text-primary)' },
  bubbleMeta: { fontSize: 11, color: 'var(--text-muted)', marginTop: 6 },
  form: { display: 'flex', flexDirection: 'column', gap: 14 },
  label: { fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 },
  input: { padding: '12px 16px', border: '1px solid var(--border-subtle)', borderRadius: radius.sm, fontSize: 15, width: '100%', boxSizing: 'border-box', backgroundColor: 'var(--bg-elevated)', color: 'var(--text-primary)', minHeight: 56 },
  textarea: { padding: '12px 16px', border: '1px solid var(--border-subtle)', borderRadius: radius.sm, fontSize: 15, width: '100%', boxSizing: 'border-box', minHeight: 120, resize: 'vertical', fontFamily: 'inherit', backgroundColor: 'var(--bg-elevated)', color: 'var(--text-primary)' },
  select: { padding: '12px 16px', border: '1px solid var(--border-subtle)', borderRadius: radius.sm, fontSize: 15, backgroundColor: 'var(--bg-elevated)', color: 'var(--text-primary)', minHeight: 56 },
  primaryBtn: { padding: '12px 20px', backgroundColor: 'var(--accent)', color: 'var(--text-inverse)', border: 'none', borderRadius: radius.sm, fontSize: 15, fontWeight: 600, cursor: 'pointer', minHeight: 56 },
  secondaryBtn: { padding: '12px 20px', backgroundColor: 'var(--bg-elevated)', color: 'var(--text-primary)', border: '1px solid var(--border-subtle)', borderRadius: radius.sm, fontSize: 15, fontWeight: 600, cursor: 'pointer', minHeight: 56 },
  dangerBtn: { padding: '12px 20px', backgroundColor: 'var(--danger-muted)', color: 'var(--danger)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: radius.sm, fontSize: 15, fontWeight: 600, cursor: 'pointer', minHeight: 56 },
  contextCard: { backgroundColor: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: radius.sm, padding: 14, marginBottom: spacing[3], fontSize: 14, color: 'var(--text-secondary)' },
  actions: { display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: spacing[3] },
}

export function statusBadgeStyle(status: string): CSSProperties {
  if (status === 'open') return supportStyles.badgeOpen
  if (status === 'claimed') return supportStyles.badgeClaimed
  return supportStyles.badgeClosed
}

export function priorityBadgeStyle(priority: string): CSSProperties | null {
  if (priority === 'urgent') return supportStyles.badgeUrgent
  if (priority === 'high') return supportStyles.badgeHigh
  return null
}
