/**
 * Pattern extraction — OBSERVED_PATTERN only. No causal claims.
 */

import type {
  ContentGapSignal,
  ObservedPattern,
  GeographyScope,
  RepetitionSignal,
  TrendSignal,
  ViralReelRef,
} from '@/lib/jarvis/instagram/niche/types'
import { geographySignalLabel } from '@/lib/jarvis/instagram/niche/segments'

export function extractHookPatterns(
  reels: ViralReelRef[],
  window: string,
  geography: GeographyScope
): ObservedPattern[] {
  const counts = new Map<string, number>()
  for (const r of reels) {
    const hook = (r.hook || r.analysis.hook || '').toLowerCase()
    let label = 'other_or_unspecified'
    if (/\?/.test(hook) || /question/.test(hook)) label = 'question_based_hooks'
    else if (/stop|don't|mistake|wrong/.test(hook)) label = 'mistake_correction_hooks'
    else if (/why you're|why you/.test(hook)) label = 'why_you_hooks'
    else if (/secret|hack/.test(hook)) label = 'secret_hack_hooks'
    else if (/transform|before/.test(hook)) label = 'transformation_hooks'
    else if (hook) label = 'statement_hooks'
    counts.set(label, (counts.get(label) || 0) + 1)
  }
  const n = reels.length
  return [...counts.entries()]
    .filter(([, c]) => c >= 1)
    .sort((a, b) => b[1] - a[1])
    .map(([label, count]) => ({
      kind: 'OBSERVED_PATTERN' as const,
      label,
      count,
      sample_size: n,
      statement: `${label.replace(/_/g, ' ')} appeared in ${count}/${n} analyzed references in this sample.`,
      window,
      geography,
    }))
}

export function extractTopicPatterns(
  reels: ViralReelRef[],
  window: string,
  geography: GeographyScope
): ObservedPattern[] {
  const counts = new Map<string, number>()
  for (const r of reels) {
    const topic = String(r.topic || r.niche || 'GENERAL_FITNESS')
    counts.set(topic, (counts.get(topic) || 0) + 1)
  }
  const n = reels.length
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([label, count]) => ({
      kind: 'OBSERVED_PATTERN' as const,
      label,
      count,
      sample_size: n,
      statement: `Topic ${label} appeared in ${count}/${n} references (observed frequency — not a causal claim).`,
      window,
      geography,
    }))
}

export function extractRepetitionSignals(
  reels: ViralReelRef[],
  sampleSize: number
): RepetitionSignal[] {
  const out: RepetitionSignal[] = []
  const threeFoods = reels.filter((r) =>
    /3 foods|three foods|foods that/i.test(`${r.title} ${r.caption} ${r.hook}`)
  ).length
  if (threeFoods >= 3) {
    out.push({
      kind: 'HOOK_SATURATION_SIGNAL',
      pattern: '3 foods that…',
      count: threeFoods,
      sample_size: sampleSize,
      statement: `This framing is heavily represented in the observed sample (${threeFoods}/${sampleSize}). Not a conclusion that the format is dead.`,
    })
  }
  const listicles = reels.filter((r) =>
    /\d+\s+(tips|mistakes|ways|foods|habits)/i.test(`${r.title} ${r.hook}`)
  ).length
  if (listicles >= Math.max(3, Math.floor(sampleSize * 0.35))) {
    out.push({
      kind: 'FORMAT_REPETITION_SIGNAL',
      pattern: 'numbered listicle hooks',
      count: listicles,
      sample_size: sampleSize,
      statement: `Numbered listicle framing appeared frequently (${listicles}/${sampleSize}). Observed repetition only.`,
    })
  }
  return out
}

export function detectContentGaps(input: {
  externalTopics: { topic: string; count: number }[]
  ownRecentTopics: string[]
  ownWindowDays: number
}): ContentGapSignal[] {
  const own = new Set(input.ownRecentTopics.map((t) => t.toLowerCase().trim()))
  const gaps: ContentGapSignal[] = []
  for (const ext of input.externalTopics) {
    if (ext.count < 3) continue
    const covered = [...own].some(
      (o) => o === ext.topic.toLowerCase() || o.includes(ext.topic.toLowerCase().slice(0, 8))
    )
    if (!covered) {
      gaps.push({
        kind: 'CONTENT_GAP_SIGNAL',
        topic: ext.topic,
        external_sample_count: ext.count,
        own_account_window_days: input.ownWindowDays,
        own_recent_coverage: 0,
        evidence: [
          `External sample: ${ext.count} references to ${ext.topic}`,
          `Own account: no related post in last ${input.ownWindowDays} days (from available local content)`,
        ],
        statement: `CONTENT_GAP_SIGNAL for ${ext.topic}. Does not claim the topic will perform well.`,
      })
    }
  }
  return gaps
}

export function trendSignalsFromPatterns(
  patterns: ObservedPattern[],
  windowHours: number,
  geography: GeographyScope
): { emerging: TrendSignal[]; uncertain: TrendSignal[] } {
  const emerging: TrendSignal[] = []
  const uncertain: TrendSignal[] = []
  for (const p of patterns.slice(0, 5)) {
    const ratio = p.sample_size ? p.count / p.sample_size : 0
    const state =
      windowHours <= 168 && ratio >= 0.35
        ? 'EMERGING'
        : ratio >= 0.5
          ? 'ESTABLISHED'
          : ratio >= 0.2
            ? 'GROWING'
            : 'UNCERTAIN'
    const signal: TrendSignal = {
      label: p.label,
      state,
      basis: `${p.count}/${p.sample_size} in ${p.window}`,
      window: p.window,
      sample_size: p.sample_size,
      geography,
      signal_kind: geographySignalLabel(geography),
    }
    if (state === 'UNCERTAIN' || p.sample_size < 5) uncertain.push(signal)
    else emerging.push(signal)
  }
  return { emerging, uncertain }
}

/** Forbidden causal language check for reports. */
export function containsCausalClaim(text: string): boolean {
  return /\b(causes?|caused|proves?|proven|guarantees?|will go viral|because of this hook)\b/i.test(
    text
  )
}
