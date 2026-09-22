/**
 * Phase 18 — Content intelligence layer.
 * Wires opportunities → creative/content-ops; fatigue via creatives.performance.
 * Taste ≠ strategy (Taste Engine remains separate).
 */

import { listOpportunities } from '@/lib/jarvis/opportunities/store'
import { listCreativePerformance } from '@/lib/ai-marketing/creative-performance'

export async function contentStrategySnapshot(): Promise<Record<string, unknown>> {
  let mix: Record<string, unknown> = { note: 'Mix defaults from content-ops' }
  try {
    const { DEFAULT_MIX, observedMix } = await import('@/lib/jarvis/content-ops/mix')
    const { getContentOpsSummary } = await import('@/lib/jarvis/content-ops')
    const summary = await getContentOpsSummary().catch(() => null)
    mix = {
      targets: DEFAULT_MIX,
      observed: typeof observedMix === 'function' ? 'see content_ops tools' : null,
      queue_summary: summary,
    }
  } catch {
    mix = { note: 'content-ops unavailable' }
  }

  const opps = await listOpportunities({
    status: ['DETECTED', 'SCORED', 'VALIDATED', 'PROPOSED'],
    limit: 10,
  })
  const contentOpps = opps.filter((o) =>
    ['CONTENT', 'CREATIVE', 'INSTAGRAM'].includes(o.type)
  )

  return {
    ok: true,
    mix,
    content_opportunities: contentOpps.map((o) => ({
      id: o.id,
      title: o.title,
      recommendation: o.recommendations[0] ?? null,
      funnel_id: o.funnel_id ?? 'UNCLASSIFIED',
    })),
    pipeline: [
      'Opportunity → Content Angle → Hook → Script → Footage → Creative Plan → EDL → Render → Review → Approval → Publish → Measure → Learn',
    ],
    note: 'Uses existing Creative Director / content-ops / Taste Engine. No auto-publish.',
  }
}

export async function contentOpportunityToPlanHint(opportunityId: string): Promise<Record<string, unknown>> {
  const { getOpportunity } = await import('@/lib/jarvis/opportunities/store')
  const opp = await getOpportunity(opportunityId)
  if (!opp) return { ok: false, error: 'not_found' }
  return {
    ok: true,
    opportunity_id: opp.id,
    suggested_next: [
      'Use creative.plan / creative.generate_draft for structured plans.',
      'Use content_ops.opportunity_from_trend for niche/queue items.',
      'Apply Taste Engine for aesthetics; strategic memory for performance patterns — do not conflate.',
    ],
    OBSERVED: opp.observed_facts,
    RECOMMENDATION: opp.recommendations,
    note: 'Plan hint only — does not create creatives or publish.',
  }
}

export async function contentFatigue(): Promise<Record<string, unknown>> {
  try {
    const rows = await listCreativePerformance({ days: 14 })
    const fatigued = (rows ?? []).filter((r) => r.classification === 'FATIGUED')
    const declining = (rows ?? []).filter((r) => r.classification === 'DECLINING')
    return {
      ok: true,
      OBSERVED_repetition_or_decline: {
        fatigued_count: fatigued.length,
        declining_count: declining.length,
      },
      INFERRED: fatigued.length
        ? ['Audience saturation or creative wear may be present — not proven causality.']
        : [],
      note: 'Uses existing classifyCreative / listCreativePerformance. Taste preferences are not overwritten.',
    }
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : 'fatigue_unavailable',
      note: 'Creative performance UNAVAILABLE',
    }
  }
}

export async function contentPerformanceBridge(): Promise<Record<string, unknown>> {
  let tasteNote = 'Taste Engine owns aesthetics'
  try {
    const { retrieveTaste } = await import('@/lib/jarvis/taste')
    const taste = await retrieveTaste({ limit: 3 }).catch(() => null)
    tasteNote = taste?.preferences
      ? `Retrieved ${taste.preferences.length} taste prefs — not performance rules.`
      : tasteNote
  } catch {
    /* optional */
  }

  let strategic: string[] = []
  try {
    const { searchStrategicMemory } = await import('@/lib/jarvis/memory/strategic')
    const pack = await searchStrategicMemory({ query: 'content creative hook performance', limit: 3 })
    strategic = pack.memories.map((m) => m.summary.slice(0, 120))
  } catch {
    strategic = []
  }

  return {
    ok: true,
    TASTE: tasteNote,
    STRATEGY_PATTERNS: strategic,
    recommendation:
      'Combine taste (aesthetic) with strategy (performance) explicitly — never let one silently overwrite the other.',
  }
}

export async function contentIntelligenceHealth(): Promise<Record<string, unknown>> {
  const snap = await contentStrategySnapshot()
  const fatigue = await contentFatigue()
  return {
    ok: true,
    opportunity_count: Array.isArray(
      (snap as { content_opportunities?: unknown[] }).content_opportunities
    )
      ? (snap as { content_opportunities: unknown[] }).content_opportunities.length
      : 0,
    fatigue_ok: Boolean((fatigue as { ok?: boolean }).ok),
    note: 'Phase 18 content intelligence health.',
  }
}
