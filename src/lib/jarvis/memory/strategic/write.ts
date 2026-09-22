/**
 * Write strategic memory candidates through existing remember() — same table.
 */

import { remember } from '@/lib/jarvis/memory/business-memory'
import { hierarchyLevelForKind } from '@/lib/jarvis/memory/kinds'
import { toLearningConfidence } from '@/lib/jarvis/memory/scopes'
import {
  evidenceLines,
  canPromoteToPattern,
  canPromoteToOperatingRule,
} from '@/lib/jarvis/memory/strategic/evidence'
import type { StrategicMemoryCandidate } from '@/lib/jarvis/memory/strategic/types'

export async function writeStrategicMemory(
  candidate: StrategicMemoryCandidate,
  opts?: {
    actorId?: string | null
    dryRun?: boolean
  }
) {
  if (candidate.domain === 'TASTE') {
    throw new Error(
      'Taste preferences belong in the Taste Engine — do not write aesthetic preference as strategic memory.'
    )
  }

  if (candidate.kind === 'PATTERN' && !canPromoteToPattern(candidate.sample_size)) {
    throw new Error('Pattern requires sample_size ≥ 3 independent observations.')
  }
  if (candidate.kind === 'OPERATING_RULE') {
    const ok = canPromoteToOperatingRule({
      sampleSize: candidate.sample_size,
      confidence: candidate.confidence,
      source_type: candidate.source_type,
    })
    if (!ok) {
      throw new Error(
        'Operating rule evidence threshold not met (or research source blocked). Use HYPOTHESIS/LESSON instead.'
      )
    }
  }

  const evidence = evidenceLines(candidate.evidence)
  const tags = [
    ...(candidate.tags ?? []),
    `level_${hierarchyLevelForKind(candidate.kind)}`,
    candidate.source_type.toLowerCase(),
  ]
  if (candidate.kind === 'STRATEGIC_INSIGHT') tags.push('strategic_insight')
  if (candidate.kind === 'PATTERN') tags.push('pattern')
  if (candidate.kind === 'OBSERVATION') tags.push('observation')
  if (candidate.funnel_id) tags.push(`funnel:${candidate.funnel_id}`)

  if (opts?.dryRun) {
    return {
      dry_run: true,
      would_write: {
        kind: candidate.kind,
        title: candidate.title,
        evidence_count: evidence.length,
      },
    }
  }

  return remember({
    kind: candidate.kind,
    title: candidate.title,
    summary: candidate.statement.slice(0, 2000),
    funnelId: candidate.funnel_id ?? undefined,
    confidence: toLearningConfidence(candidate.confidence),
    tags,
    source: candidate.source,
    evidence,
    scope: candidate.scope,
    scopeId: candidate.scope_id,
    sampleSize: candidate.sample_size,
    evidenceLabel: candidate.evidence_label,
    actorId: opts?.actorId,
    details: {
      hierarchy_level: hierarchyLevelForKind(candidate.kind),
      source_type: candidate.source_type,
      causality: candidate.causality,
      strategic_evidence: candidate.evidence,
      domain: candidate.domain ?? 'STRATEGY',
    },
  })
}
