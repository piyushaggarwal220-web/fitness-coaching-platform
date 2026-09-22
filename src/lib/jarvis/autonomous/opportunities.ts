/**
 * Opportunity detection — OBSERVED / INFERENCE / RECOMMENDATION.
 * Never guarantees results or virality.
 */

import { opportunityFingerprint } from '@/lib/jarvis/autonomous/fingerprint'
import type { OpportunityItem } from '@/lib/jarvis/autonomous/types'

export async function detectOpportunities(input: {
  funnelPerformance: {
    byFunnel: {
      funnel_name: string
      classified: boolean
      spend: number
      cpa: number | null
      target_cpa: number | null
      initial_roas: number | null
      target_roas: number | null
    }[]
  }
  contentNeedsReview: number
  contentScheduled: number
}): Promise<OpportunityItem[]> {
  const out: OpportunityItem[] = []

  for (const f of input.funnelPerformance.byFunnel) {
    if (!f.classified || f.spend < 300) continue
    if (
      f.cpa != null &&
      f.target_cpa != null &&
      f.cpa < f.target_cpa * 0.75 &&
      f.spend >= 500
    ) {
      out.push({
        fingerprint: opportunityFingerprint('meta', `strong_cpa_${f.funnel_name}`),
        title: `${f.funnel_name} CPA below configured target`,
        observed: [
          `CPA ₹${f.cpa.toFixed(0)} vs target ₹${f.target_cpa} over the observation window (spend ₹${f.spend.toFixed(0)}).`,
        ],
        inference: [
          'Acquisition economics look favorable relative to this funnel’s configured target — sample-limited.',
        ],
        recommendation: [
          'Investigate whether volume can increase within cost governor and approval rules. Do not auto-raise budget.',
        ],
        system: 'MARKETING',
        confidence: 'medium',
      })
    }
    if (
      f.initial_roas != null &&
      f.target_roas != null &&
      f.initial_roas > f.target_roas * 1.25 &&
      f.spend >= 500
    ) {
      out.push({
        fingerprint: opportunityFingerprint('meta', `strong_roas_${f.funnel_name}`),
        title: `${f.funnel_name} ROAS above configured target`,
        observed: [`ROAS ${f.initial_roas.toFixed(2)} vs target ${f.target_roas}`],
        inference: ['Relative to configured target, returns look strong in this window.'],
        recommendation: [
          'Review creative/adset mix before any spend change. Significant spend changes still require approval.',
        ],
        system: 'MARKETING',
        confidence: 'medium',
      })
    }
  }

  if (input.contentScheduled === 0 && input.contentNeedsReview === 0) {
    out.push({
      fingerprint: opportunityFingerprint('content', 'fill_calendar'),
      title: 'Content calendar gap',
      observed: ['No scheduled content and no items awaiting review in this observation.'],
      inference: ['Pipeline may be under-filled relative to desired cadence (if cadence is configured).'],
      recommendation: [
        'Propose next week’s content batch (plans only). Do not auto-publish.',
      ],
      system: 'CONTENT',
      confidence: 'low',
    })
  }

  return out.slice(0, 8)
}
