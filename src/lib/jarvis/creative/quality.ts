/**
 * Deterministic creative quality checks before returning a plan.
 */

import type { SourceMapping } from '@/lib/jarvis/video/intelligence/types'
import type { CreativeHook, CreativeObjective, CreativeQualityResult, ScriptBeat } from '@/lib/jarvis/creative/types'
import { ctaMatchesObjective } from '@/lib/jarvis/creative/cta'
import { collectClaimFlags } from '@/lib/jarvis/creative/claims'

export function runCreativeQualityChecks(input: {
  source_segments: SourceMapping[]
  script_beats: ScriptBeat[]
  hook: CreativeHook
  cta: string
  objective: CreativeObjective
  estimated_duration_sec: number
  target_duration_sec?: number | null
  known_source_ids?: Set<string>
}): CreativeQualityResult {
  const reasons: string[] = []

  for (const m of input.source_segments) {
    if (!m.source_id) reasons.push('Source mapping missing source_id')
    if (!(m.end > m.start)) reasons.push(`Invalid time range ${m.start}-${m.end}`)
    if (input.known_source_ids && !input.known_source_ids.has(m.source_id)) {
      reasons.push(`Unknown source_id ${m.source_id}`)
    }
  }

  // Overlap check within same source
  const bySource = new Map<string, SourceMapping[]>()
  for (const m of input.source_segments) {
    const list = bySource.get(m.source_id) ?? []
    list.push(m)
    bySource.set(m.source_id, list)
  }
  for (const [sid, list] of bySource) {
    const sorted = [...list].sort((a, b) => a.start - b.start)
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i]!.start < sorted[i - 1]!.end) {
        reasons.push(`Overlapping ranges on source ${sid}`)
      }
    }
  }

  if (input.estimated_duration_sec <= 0) {
    reasons.push('Estimated duration not plausible')
  }
  if (
    input.target_duration_sec &&
    input.estimated_duration_sec > input.target_duration_sec * 1.6 &&
    input.script_beats.every((b) => b.kind === 'SPOKEN_FOOTAGE')
  ) {
    reasons.push('Plan longer than target with only existing footage — trim or retarget')
  }

  if (!input.hook.source_support && !input.hook.missing_footage) {
    reasons.push('Hook lacks source support flag consistency')
  }
  if (input.hook.text && !input.hook.source_support) {
    reasons.push('Hook not supported by footage — marked for new recording')
  }

  if (!ctaMatchesObjective(input.cta, input.objective)) {
    reasons.push(`CTA may not match objective ${input.objective}`)
  }

  const claim_flags = collectClaimFlags([
    input.hook.text,
    ...input.script_beats.map((b) => b.text),
    input.cta,
    ...input.hook.claim_flags,
  ])

  // spoken beats must have sources
  for (const b of input.script_beats) {
    if (b.kind === 'SPOKEN_FOOTAGE' && (!b.source || !(b.source.end > b.source.start))) {
      reasons.push(`Spoken beat "${b.role}" missing valid source timestamps`)
    }
  }

  const claim_review_required = claim_flags.length > 0
  if (claim_review_required) {
    reasons.push('CLAIM_REVIEW_REQUIRED: ' + claim_flags.join(', '))
  }

  // Soft: missing CTA footage is ok if new recording listed — not a hard fail
  const hard = reasons.filter(
    (r) =>
      !r.startsWith('Hook not supported') &&
      !r.startsWith('CTA may not') &&
      !r.startsWith('CLAIM_REVIEW') &&
      !r.startsWith('Plan longer')
  )

  return {
    status: hard.length ? 'NEEDS_REVISION' : 'READY',
    reasons,
    claim_review_required,
    claim_flags,
  }
}
