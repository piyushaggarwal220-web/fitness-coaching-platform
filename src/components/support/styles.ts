import type { CSSProperties } from 'react'
import { colors, spacing, radius } from '@/lib/design-tokens'

export const supportStyles: Record<string, CSSProperties> = {
  page: { minHeight: '100vh', backgroundColor: colors.bgPrimary },
  container: { maxWidth: 960, margin: '0 auto', padding: `${spacing[4]}px ${spacing[3]}px`, paddingTop: `calc(56px + ${spacing[4]}px)`, paddingBottom: `calc(72px + ${spacing[4]}px)` },
  containerNarrow: { maxWidth: 720, margin: '0 auto', padding: `${spacing[4]}px ${spacing[3]}px`, paddingTop: `calc(56px + ${spacing[4]}px)`, paddingBottom: `calc(72px + ${spacing[4]}px)` },
  title: { margin: '0 0 6px 0', fontSize: 26, fontWeight: 800, color: colors.textPrimary, letterSpacing: '-0.02em' },
  subtitle: { margin: '0 0 24px 0', color: colors.textSecondary, fontSize: 15 },
  backLink: { display: 'inline-block', color: colors.accent, textDecoration: 'none', marginBottom: spacing[3], fontWeight: 600, fontSize: 14 },
  loading: { display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '50vh', color: colors.textSecondary },
  error: { backgroundColor: colors.dangerMuted, color: colors.danger, padding: spacing[2], borderRadius: radius.sm, marginBottom: spacing[3], fontSize: 14 },
  success: { backgroundColor: colors.successMuted, color: colors.success, padding: spacing[2], borderRadius: radius.sm, marginBottom: spacing[3], fontSize: 14 },
  empty: { backgroundColor: colors.bgCard, border: `1px solid ${colors.borderSubtle}`, borderRadius: radius.md, padding: 40, textAlign: 'center', color: colors.textMuted },
  card: { backgroundColor: colors.bgCard, border: `1px solid ${colors.borderSubtle}`, borderRadius: radius.md, padding: spacing[4], marginBottom: spacing[2] },
  inboxList: { display: 'flex', flexDirection: 'column', gap: 10 },
  inboxItem: {
    display: 'block',
    backgroundColor: colors.bgCard,
    border: `1px solid ${colors.borderSubtle}`,
    borderRadius: radius.md,
    padding: '16px 18px',
    textDecoration: 'none',
    color: 'inherit',
    transition: 'border-color 150ms ease',
  },
  inboxTitle: { margin: '0 0 4px 0', fontSize: 16, fontWeight: 600, color: colors.textPrimary },
  inboxMeta: { fontSize: 13, color: colors.textMuted, display: 'flex', flexWrap: 'wrap', gap: 8 },
  badge: { display: 'inline-block', padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600 },
  badgeOpen: { backgroundColor: colors.accentMuted, color: colors.accent },
  badgeClaimed: { backgroundColor: colors.warningMuted, color: colors.warning },
  badgeClosed: { backgroundColor: colors.bgElevated, color: colors.textMuted },
  badgeUrgent: { backgroundColor: colors.dangerMuted, color: colors.danger },
  badgeHigh: { backgroundColor: colors.warningMuted, color: colors.warning },
  tabs: { display: 'flex', gap: 8, marginBottom: spacing[4], flexWrap: 'wrap' },
  tab: { padding: '10px 16px', borderRadius: radius.sm, border: `1px solid ${colors.borderSubtle}`, backgroundColor: colors.bgElevated, cursor: 'pointer', fontSize: 14, color: colors.textSecondary, minHeight: 44 },
  tabActive: { padding: '10px 16px', borderRadius: radius.sm, border: `1px solid ${colors.accent}`, backgroundColor: colors.accentMuted, color: colors.accent, cursor: 'pointer', fontSize: 14, fontWeight: 600, minHeight: 44 },
  thread: { display: 'flex', flexDirection: 'column', gap: 12, marginBottom: spacing[4] },
  bubbleClient: { alignSelf: 'flex-start', maxWidth: '85%', backgroundColor: colors.bgElevated, borderRadius: 16, padding: '12px 14px', fontSize: 14, lineHeight: 1.5, color: colors.textPrimary, border: `1px solid ${colors.borderSubtle}` },
  bubbleCoach: { alignSelf: 'flex-end', maxWidth: '85%', backgroundColor: colors.accentMuted, borderRadius: 16, padding: '12px 14px', fontSize: 14, lineHeight: 1.5, color: colors.textPrimary },
  bubbleMeta: { fontSize: 11, color: colors.textMuted, marginTop: 6 },
  form: { display: 'flex', flexDirection: 'column', gap: 14 },
  label: { fontSize: 13, fontWeight: 600, color: colors.textSecondary, marginBottom: 4 },
  input: { padding: '12px 16px', border: `1px solid ${colors.borderSubtle}`, borderRadius: radius.sm, fontSize: 15, width: '100%', boxSizing: 'border-box', backgroundColor: colors.bgElevated, color: colors.textPrimary, minHeight: 56 },
  textarea: { padding: '12px 16px', border: `1px solid ${colors.borderSubtle}`, borderRadius: radius.sm, fontSize: 15, width: '100%', boxSizing: 'border-box', minHeight: 120, resize: 'vertical', fontFamily: 'inherit', backgroundColor: colors.bgElevated, color: colors.textPrimary },
  select: { padding: '12px 16px', border: `1px solid ${colors.borderSubtle}`, borderRadius: radius.sm, fontSize: 15, backgroundColor: colors.bgElevated, color: colors.textPrimary, minHeight: 56 },
  primaryBtn: { padding: '12px 20px', backgroundColor: colors.accent, color: colors.textInverse, border: 'none', borderRadius: radius.sm, fontSize: 15, fontWeight: 600, cursor: 'pointer', minHeight: 56 },
  secondaryBtn: { padding: '12px 20px', backgroundColor: colors.bgElevated, color: colors.textPrimary, border: `1px solid ${colors.borderSubtle}`, borderRadius: radius.sm, fontSize: 15, fontWeight: 600, cursor: 'pointer', minHeight: 56 },
  dangerBtn: { padding: '12px 20px', backgroundColor: colors.dangerMuted, color: colors.danger, border: `1px solid rgba(239,68,68,0.2)`, borderRadius: radius.sm, fontSize: 15, fontWeight: 600, cursor: 'pointer', minHeight: 56 },
  contextCard: { backgroundColor: colors.bgElevated, border: `1px solid ${colors.borderSubtle}`, borderRadius: radius.sm, padding: 14, marginBottom: spacing[3], fontSize: 14, color: colors.textSecondary },
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
