/**
 * Detect business opportunities from funnel performance + systems.
 * Extends Phase 10 detector into durable jarvis_opportunities rows.
 * Never invents numbers; never blends funnels.
 */

import { getPerformanceByFunnel } from '@/lib/ai-marketing/funnels'
import {
  opportunityBusinessFingerprint,
  upsertOpportunity,
} from '@/lib/jarvis/opportunities/store'
import { freshnessFromAgeHours, uncertaintyFromEvidence } from '@/lib/jarvis/opportunities/scoring'
import { detectOpportunities as detectLegacy } from '@/lib/jarvis/autonomous/opportunities'

export async function detectAndPersistOpportunities(opts?: {
  days?: number
}): Promise<{ upserted: number; fingerprints: string[] }> {
  const perf = await getPerformanceByFunnel({ days: opts?.days ?? 7 })
  const fingerprints: string[] = []
  let upserted = 0

  for (const f of perf.byFunnel) {
    if (!f.funnel_id) continue // never invent funnel
    const spend = f.spend
    const cpa = f.cpa
    const target = f.target_cpa

    if (spend >= 500 && cpa != null && target != null && cpa > target * 1.25) {
      const fp = opportunityBusinessFingerprint({
        type: 'MARKETING_EFFICIENCY',
        funnel_id: f.funnel_id,
        key: `cpa_above_target_${opts?.days ?? 7}d`,
      })
      const conf = spend >= 2000 ? 'MEDIUM' : 'LOW'
      const strength = spend >= 2000 ? 'MODERATE' : 'WEAK'
      const r = await upsertOpportunity({
        fingerprint: fp,
        type: 'MARKETING_EFFICIENCY',
        title: `${f.funnel_name}: CPA above target`,
        summary: `Observed CPA above configured target for this funnel only. Causality not established.`,
        funnel_id: f.funnel_id,
        system: 'META',
        observed_facts: [
          `CPA ₹${Math.round(cpa)} vs target ₹${target} (spend ₹${Math.round(spend)}, ${opts?.days ?? 7}d window).`,
        ],
        inferences: [
          'Acquisition efficiency may be deteriorating relative to this funnel’s configured target.',
        ],
        hypotheses: [
          'Creative fatigue, audience saturation, or landing/checkout friction may be contributing — unproven.',
        ],
        recommendations: [
          'Investigate creative performance and conversion path for this funnel. Do not auto-raise budget.',
        ],
        confidence: conf,
        evidence_strength: strength,
        freshness: freshnessFromAgeHours(1),
        uncertainty: uncertaintyFromEvidence(strength, conf),
        impact: cpa > target * 1.5 ? 'HIGH' : 'MEDIUM',
        urgency: 'HIGH',
        actionability: 'MEDIUM',
        expected_impact: 'Improve acquisition efficiency if root cause is addressable',
        impact_horizon: '7–14d after intervention',
        evidence: [{ source: 'marketing_performance', funnel_id: f.funnel_id, metric: 'cpa' }],
      })
      if (r.ok) {
        upserted += 1
        fingerprints.push(fp)
      }
    }

    if (spend >= 500 && cpa != null && target != null && cpa < target * 0.75) {
      const fp = opportunityBusinessFingerprint({
        type: 'MARKETING_EFFICIENCY',
        funnel_id: f.funnel_id,
        key: `cpa_below_target_${opts?.days ?? 7}d`,
      })
      const r = await upsertOpportunity({
        fingerprint: fp,
        type: 'MARKETING_EFFICIENCY',
        title: `${f.funnel_name}: CPA below target (positive)`,
        summary: 'Observed favorable CPA vs target for this funnel. Not a guarantee of scale.',
        funnel_id: f.funnel_id,
        system: 'META',
        observed_facts: [
          `CPA ₹${Math.round(cpa)} vs target ₹${target} (spend ₹${Math.round(spend)}).`,
        ],
        inferences: ['Economics look favorable relative to configured target — sample-limited.'],
        recommendations: [
          'Investigate whether volume can increase within cost governor and approval rules.',
        ],
        confidence: 'MEDIUM',
        evidence_strength: 'MODERATE',
        freshness: freshnessFromAgeHours(1),
        uncertainty: 'LIKELY',
        impact: 'MEDIUM',
        urgency: 'MEDIUM',
        actionability: 'MEDIUM',
      })
      if (r.ok) {
        upserted += 1
        fingerprints.push(fp)
      }
    }
  }

  // Unclassified spend risk — never assign a funnel
  if (perf.unclassified?.spend && perf.unclassified.spend >= 500) {
    const fp = opportunityBusinessFingerprint({
      type: 'FUNNEL',
      funnel_id: null,
      key: 'unclassified_spend',
    })
    const r = await upsertOpportunity({
      fingerprint: fp,
      type: 'FUNNEL',
      title: 'Unclassified ad spend',
      summary: 'Spend exists without funnel_id — UNCLASSIFIED. Do not infer funnel from price.',
      funnel_id: null,
      system: 'META',
      observed_facts: [`Unclassified spend ₹${Math.round(perf.unclassified.spend)} in window.`],
      inferences: ['Attribution/mapping gap may reduce funnel-level decision quality.'],
      recommendations: ['Map campaigns to funnels. Do not merge ₹99 and ₹1,699 economics.'],
      confidence: 'HIGH',
      evidence_strength: 'STRONG',
      freshness: freshnessFromAgeHours(1),
      uncertainty: 'KNOWN',
      impact: 'MEDIUM',
      urgency: 'MEDIUM',
      actionability: 'HIGH',
    })
    if (r.ok) {
      upserted += 1
      fingerprints.push(fp)
    }
  }

  // Keep Phase 10 detector for overnight notifications (ephemeral)
  await detectLegacy({
    funnelPerformance: {
      byFunnel: perf.byFunnel.map((f) => ({
        funnel_name: f.funnel_name,
        classified: Boolean(f.funnel_id),
        spend: f.spend,
        cpa: f.cpa,
        target_cpa: f.target_cpa,
        initial_roas: f.initial_roas,
        target_roas: f.target_roas,
      })),
    },
    contentNeedsReview: 0,
    contentScheduled: 0,
  }).catch(() => [])

  return { upserted, fingerprints }
}

export async function opportunityFromEvent(input: {
  eventId: string
  eventType: string
  funnelId: string | null
  reason: string
  significance: string
}): Promise<{ ok: boolean; fingerprint?: string }> {
  if (!['INVESTIGATE', 'ALERT', 'URGENT'].includes(input.significance)) {
    return { ok: true }
  }
  const type =
    /instagram/i.test(input.eventType)
      ? 'INSTAGRAM'
      : /shopify/i.test(input.eventType)
        ? 'SHOPIFY'
        : /cpa|roas|funnel|meta/i.test(input.eventType)
          ? 'MARKETING_EFFICIENCY'
          : /system|fail/i.test(input.eventType)
            ? 'SYSTEM_RISK'
            : 'OPERATIONAL'

  const fp = opportunityBusinessFingerprint({
    type,
    funnel_id: input.funnelId,
    key: `event:${input.eventType}`,
  })
  const r = await upsertOpportunity({
    fingerprint: fp,
    type,
    title: `Event: ${input.eventType}`,
    summary: input.reason.slice(0, 500),
    funnel_id: input.funnelId,
    system: 'EVENT',
    observed_facts: [`Event ${input.eventType} marked ${input.significance}.`],
    inferences: ['May indicate a material business change — investigate before acting.'],
    recommendations: ['Review event details. Significant writes still require Phase 12 approval.'],
    source_event_ids: [input.eventId],
    confidence: 'LOW',
    evidence_strength: 'WEAK',
    freshness: freshnessFromAgeHours(0),
    uncertainty: 'POSSIBLE',
    impact: input.significance === 'URGENT' ? 'HIGH' : 'MEDIUM',
    urgency: input.significance === 'URGENT' ? 'CRITICAL' : 'HIGH',
    status: 'DETECTED',
  })
  return { ok: r.ok, fingerprint: fp }
}
