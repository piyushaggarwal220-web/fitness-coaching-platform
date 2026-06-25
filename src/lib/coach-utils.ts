import type { CSSProperties } from 'react'
import type { ClientProfile } from '@/types/database'

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
  overdue: { backgroundColor: '#f8d7da', color: '#721c24', padding: '2px 10px', borderRadius: 12, fontSize: 12 },
  awaiting: { backgroundColor: '#fff3cd', color: '#856404', padding: '2px 10px', borderRadius: 12, fontSize: 12 },
  new: { backgroundColor: '#cce5ff', color: '#004085', padding: '2px 10px', borderRadius: 12, fontSize: 12 },
  ok: { backgroundColor: '#d4edda', color: '#155724', padding: '2px 10px', borderRadius: 12, fontSize: 12 },
  pending: { backgroundColor: '#e2e3e5', color: '#383d41', padding: '2px 10px', borderRadius: 12, fontSize: 12 },
  delivered: { backgroundColor: '#d4edda', color: '#155724', padding: '2px 10px', borderRadius: 12, fontSize: 12 },
}
