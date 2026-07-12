import type { StoredComplexityTier } from '@/lib/ai/complexity-score'
import { colors } from '@/lib/design-tokens'

export const COMPLEXITY_TIER_COLORS: Record<StoredComplexityTier, { bg: string; text: string; border: string }> = {
  low: { bg: colors.successMuted, text: colors.success, border: colors.success },
  medium: { bg: colors.warningMuted, text: colors.warning, border: colors.warning },
  high: { bg: colors.dangerMuted, text: colors.danger, border: colors.danger },
}

export const COMPLEXITY_TIER_LABELS: Record<StoredComplexityTier, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
}

export function formatTierLabel(tier: StoredComplexityTier | string | null | undefined): string {
  if (!tier) return '—'
  const key = tier.toLowerCase() as StoredComplexityTier
  return COMPLEXITY_TIER_LABELS[key] ?? tier
}

export function formatScoreChange(change: number | null | undefined): {
  direction: 'improved' | 'increased' | 'unchanged' | 'new'
  label: string
  arrow: string
} {
  if (change === null || change === undefined) {
    return { direction: 'new', label: 'First calculation', arrow: '' }
  }
  if (change === 0) {
    return { direction: 'unchanged', label: 'No change', arrow: '→' }
  }
  if (change < 0) {
    return {
      direction: 'improved',
      label: `Improved by ${Math.abs(change)}`,
      arrow: '▼',
    }
  }
  return {
    direction: 'increased',
    label: `Increased by ${change}`,
    arrow: '▲',
  }
}

export function formatScoreTransition(
  previous: number | null | undefined,
  current: number | null | undefined
): string {
  if (previous == null || current == null) return current != null ? String(current) : '—'
  return `${previous} → ${current}`
}
