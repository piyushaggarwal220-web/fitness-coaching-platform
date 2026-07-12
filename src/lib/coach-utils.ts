import type { CSSProperties } from 'react'
import type { ClientProfile } from '@/types/database'
import { colors } from '@/lib/design-tokens'

export const FITNESS_GOAL_LABELS: Record<string, string> = {
  lose_weight: 'Lose Weight',
  build_muscle: 'Build Muscle',
  stay_fit: 'Stay Fit',
  increase_stamina: 'Increase Stamina',
  fat_loss: 'Fat Loss',
  muscle_gain: 'Muscle Gain',
  recomposition: 'Recomposition',
  strength: 'Strength',
  athletic_performance: 'Athletic Performance',
}

export function formatFitnessGoal(goal: string | null | undefined): string {
  if (!goal) return 'Not set'
  return FITNESS_GOAL_LABELS[goal] ?? goal.replace(/_/g, ' ')
}

export function formatDate(date: string | null | undefined): string {
  if (!date) return '—'
  return new Date(date).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

export function getPlanStatus(client: Pick<ClientProfile, 'plan_delivered'>): string {
  return client.plan_delivered ? 'Delivered' : 'Pending'
}

export function getCheckinStatus(client: Pick<ClientProfile, 'checkin_awaiting' | 'checkin_overdue'>): string {
  if (client.checkin_overdue) return 'Overdue'
  if (client.checkin_awaiting) return 'Awaiting'
  return 'Up to date'
}

export const coachBadgeStyles: Record<string, CSSProperties> = {
  overdue: { backgroundColor: colors.dangerMuted, color: colors.danger, padding: '2px 10px', borderRadius: 12, fontSize: 12, fontWeight: 600 },
  awaiting: { backgroundColor: colors.warningMuted, color: colors.warning, padding: '2px 10px', borderRadius: 12, fontSize: 12, fontWeight: 600 },
  new: { backgroundColor: colors.accentMuted, color: colors.accent, padding: '2px 10px', borderRadius: 12, fontSize: 12, fontWeight: 600 },
  ok: { backgroundColor: colors.successMuted, color: colors.success, padding: '2px 10px', borderRadius: 12, fontSize: 12, fontWeight: 600 },
  pending: { backgroundColor: colors.bgElevated, color: colors.textMuted, padding: '2px 10px', borderRadius: 12, fontSize: 12, fontWeight: 600 },
  delivered: { backgroundColor: colors.successMuted, color: colors.success, padding: '2px 10px', borderRadius: 12, fontSize: 12, fontWeight: 600 },
}
