import type { CSSProperties } from 'react'

export const supportStyles: Record<string, CSSProperties> = {
  page: { minHeight: '100vh', backgroundColor: '#f6f7f9' },
  container: { maxWidth: 960, margin: '0 auto', padding: '28px 20px' },
  containerNarrow: { maxWidth: 720, margin: '0 auto', padding: '28px 20px' },
  title: { margin: '0 0 6px 0', fontSize: 26, fontWeight: 700, color: '#1a1a2e' },
  subtitle: { margin: '0 0 24px 0', color: '#666', fontSize: 15 },
  backLink: { display: 'inline-block', color: '#4f46e5', textDecoration: 'none', marginBottom: 16, fontWeight: 600, fontSize: 14 },
  loading: { display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '50vh', color: '#666' },
  error: { backgroundColor: '#fef2f2', color: '#991b1b', padding: 12, borderRadius: 8, marginBottom: 16, fontSize: 14 },
  success: { backgroundColor: '#ecfdf5', color: '#065f46', padding: 12, borderRadius: 8, marginBottom: 16, fontSize: 14 },
  empty: { backgroundColor: 'white', border: '1px solid #e8eaed', borderRadius: 10, padding: 40, textAlign: 'center', color: '#666' },
  card: { backgroundColor: 'white', border: '1px solid #e8eaed', borderRadius: 10, padding: 20, marginBottom: 12 },
  inboxList: { display: 'flex', flexDirection: 'column', gap: 10 },
  inboxItem: {
    display: 'block',
    backgroundColor: 'white',
    border: '1px solid #e8eaed',
    borderRadius: 10,
    padding: '16px 18px',
    textDecoration: 'none',
    color: 'inherit',
    transition: 'border-color 0.15s',
  },
  inboxTitle: { margin: '0 0 4px 0', fontSize: 16, fontWeight: 600, color: '#1a1a2e' },
  inboxMeta: { fontSize: 13, color: '#888', display: 'flex', flexWrap: 'wrap', gap: 8 },
  badge: { display: 'inline-block', padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600 },
  badgeOpen: { backgroundColor: '#dbeafe', color: '#1e40af' },
  badgeClaimed: { backgroundColor: '#fef3c7', color: '#92400e' },
  badgeClosed: { backgroundColor: '#e5e7eb', color: '#374151' },
  badgeUrgent: { backgroundColor: '#fee2e2', color: '#991b1b' },
  badgeHigh: { backgroundColor: '#ffedd5', color: '#9a3412' },
  tabs: { display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' },
  tab: { padding: '8px 16px', borderRadius: 8, border: '1px solid #ddd', backgroundColor: 'white', cursor: 'pointer', fontSize: 14 },
  tabActive: { padding: '8px 16px', borderRadius: 8, border: '1px solid #4f46e5', backgroundColor: '#eef2ff', color: '#3730a3', cursor: 'pointer', fontSize: 14, fontWeight: 600 },
  thread: { display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 20 },
  bubbleClient: { alignSelf: 'flex-start', maxWidth: '85%', backgroundColor: '#f3f4f6', borderRadius: 10, padding: '12px 14px', fontSize: 14, lineHeight: 1.5 },
  bubbleCoach: { alignSelf: 'flex-end', maxWidth: '85%', backgroundColor: '#eef2ff', borderRadius: 10, padding: '12px 14px', fontSize: 14, lineHeight: 1.5 },
  bubbleMeta: { fontSize: 11, color: '#888', marginTop: 6 },
  form: { display: 'flex', flexDirection: 'column', gap: 14 },
  label: { fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 4 },
  input: { padding: '11px 12px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 15, width: '100%', boxSizing: 'border-box' },
  textarea: { padding: '11px 12px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 15, width: '100%', boxSizing: 'border-box', minHeight: 120, resize: 'vertical', fontFamily: 'inherit' },
  select: { padding: '11px 12px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 15, backgroundColor: 'white' },
  primaryBtn: { padding: '12px 20px', backgroundColor: '#4f46e5', color: 'white', border: 'none', borderRadius: 8, fontSize: 15, fontWeight: 600, cursor: 'pointer' },
  secondaryBtn: { padding: '12px 20px', backgroundColor: '#1a1a2e', color: 'white', border: 'none', borderRadius: 8, fontSize: 15, fontWeight: 600, cursor: 'pointer' },
  dangerBtn: { padding: '12px 20px', backgroundColor: '#b91c1c', color: 'white', border: 'none', borderRadius: 8, fontSize: 15, fontWeight: 600, cursor: 'pointer' },
  contextCard: { backgroundColor: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 8, padding: 14, marginBottom: 16, fontSize: 14 },
  actions: { display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 16 },
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
