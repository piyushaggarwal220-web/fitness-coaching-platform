/**
 * Business health per area — operational states with evidence.
 * Thresholds come from existing funnel config / observations — not invented universal benchmarks.
 */

import type { AreaHealth, HealthState, IntegrationHealth } from '@/lib/jarvis/autonomous/types'
import type { ProactiveFinding } from '@/lib/jarvis/workers/proactive'

function worse(a: HealthState, b: HealthState): HealthState {
  const order: HealthState[] = ['HEALTHY', 'ATTENTION', 'WARNING', 'CRITICAL', 'UNKNOWN']
  // UNKNOWN is worse than HEALTHY for display but not CRITICAL
  const score = (s: HealthState) => {
    if (s === 'UNKNOWN') return 1.5
    return order.indexOf(s)
  }
  return score(a) >= score(b) ? a : b
}

export function severityToHealth(sev: string): HealthState {
  if (sev === 'CRITICAL') return 'CRITICAL'
  if (sev === 'WARNING') return 'WARNING'
  if (sev === 'NOTICE') return 'ATTENTION'
  if (sev === 'INFO') return 'HEALTHY'
  return 'UNKNOWN'
}

export function mapIntegrationStatus(input: {
  configured: boolean
  ok?: boolean
  stale?: boolean
  error?: boolean
}): IntegrationHealth {
  if (!input.configured) return 'NOT_CONFIGURED'
  if (input.error) return 'UNAVAILABLE'
  if (input.stale) return 'DEGRADED'
  if (input.ok === false) return 'UNAVAILABLE'
  return 'CONNECTED'
}

export function computeBusinessHealth(input: {
  findings: ProactiveFinding[]
  revenueOk?: boolean
  revenueStale?: boolean
  contentBlocked?: number
  contentNeedsReview?: number
  publishingEnabled?: boolean
  igConfigured?: boolean
  igStale?: boolean
  budgetExhausted?: boolean
  systemsUnavailable?: string[]
}): AreaHealth[] {
  const byArea: Record<string, AreaHealth> = {
    REVENUE: {
      area: 'REVENUE',
      state: input.revenueOk === false ? 'UNKNOWN' : input.revenueStale ? 'ATTENTION' : 'HEALTHY',
      reason: input.revenueStale
        ? 'Revenue data may be stale or incomplete for the current window.'
        : input.revenueOk === false
          ? 'LURVOX revenue source unavailable — not zero.'
          : 'No revenue anomaly flagged from configured detectors.',
      evidence: [],
      next_action: input.revenueOk === false ? 'Investigate LURVOX payment ledger source' : null,
    },
    MARKETING: {
      area: 'MARKETING',
      state: 'HEALTHY',
      reason: 'No marketing findings yet.',
      evidence: [],
      next_action: null,
    },
    FUNNEL: {
      area: 'FUNNEL',
      state: 'HEALTHY',
      reason: 'No funnel findings yet.',
      evidence: [],
      next_action: null,
    },
    CONTENT: {
      area: 'CONTENT',
      state:
        (input.contentBlocked ?? 0) > 0
          ? 'WARNING'
          : (input.contentNeedsReview ?? 0) > 0
            ? 'ATTENTION'
            : 'HEALTHY',
      reason:
        (input.contentBlocked ?? 0) > 0
          ? `${input.contentBlocked} content item(s) blocked.`
          : (input.contentNeedsReview ?? 0) > 0
            ? `${input.contentNeedsReview} item(s) need review.`
            : 'Content pipeline has no open blockers from this observation.',
      evidence: [],
      next_action:
        (input.contentBlocked ?? 0) > 0
          ? 'Resolve content blockers'
          : (input.contentNeedsReview ?? 0) > 0
            ? 'Review pending content'
            : null,
    },
    INSTAGRAM: {
      area: 'INSTAGRAM',
      state: !input.igConfigured
        ? 'UNKNOWN'
        : input.igStale
          ? 'ATTENTION'
          : 'HEALTHY',
      reason: !input.igConfigured
        ? 'Instagram not configured (NOT_CONFIGURED ≠ broken).'
        : input.igStale
          ? 'Instagram metrics appear stale; current performance cannot be verified.'
          : 'Instagram integration observed without stale/unavailable flag.',
      evidence: [],
      next_action: input.igStale ? 'Refresh Instagram sync' : null,
    },
    OPERATIONS: {
      area: 'OPERATIONS',
      state: 'HEALTHY',
      reason: 'No operations findings yet.',
      evidence: [],
      next_action: null,
    },
    SYSTEMS: {
      area: 'SYSTEMS',
      state: (input.systemsUnavailable?.length ?? 0) > 0 ? 'WARNING' : 'HEALTHY',
      reason:
        (input.systemsUnavailable?.length ?? 0) > 0
          ? `Unavailable/degraded: ${input.systemsUnavailable!.join(', ')}`
          : 'No system unavailability flagged in this observation.',
      evidence: input.systemsUnavailable ?? [],
      next_action:
        (input.systemsUnavailable?.length ?? 0) > 0 ? 'Check integrations / diagnostics' : null,
    },
    COST: {
      area: 'COST',
      state: input.budgetExhausted ? 'CRITICAL' : 'HEALTHY',
      reason: input.budgetExhausted
        ? 'AI budget exhausted or near exhaustion — autonomous work should pause.'
        : 'Cost governor not reporting exhaustion.',
      evidence: [],
      next_action: input.budgetExhausted ? 'Raise budget via settings (human) or wait for reset' : null,
    },
  }

  for (const f of input.findings) {
    const h = severityToHealth(f.severity)
    let area = 'OPERATIONS'
    if (f.source.includes('lurvox') || f.title.toLowerCase().includes('revenue')) area = 'REVENUE'
    else if (f.source.includes('funnel') || f.title.toLowerCase().includes('cpa') || f.title.toLowerCase().includes('roas'))
      area = 'FUNNEL'
    else if (f.source.includes('meta')) area = 'MARKETING'
    else if (f.source.includes('cost') || f.title.toLowerCase().includes('budget')) area = 'COST'
    else if (f.source.includes('instagram') || f.source.includes('ig')) area = 'INSTAGRAM'
    else if (f.source.includes('background') || f.source.includes('approval')) area = 'OPERATIONS'
    else if (f.source.includes('integration')) area = 'SYSTEMS'

    const row = byArea[area]
    if (!row) continue
    row.state = worse(row.state, h)
    row.evidence.push(`${f.severity}: ${f.detail}`)
    row.reason = f.detail
    if (!row.next_action) row.next_action = `Investigate: ${f.title}`
  }

  return Object.values(byArea) as AreaHealth[]
}
