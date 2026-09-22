/**
 * Extended anomaly detection — wraps proactive findings + content/stale/system signals.
 * Uses existing funnel thresholds; does not invent universal marketing benchmarks.
 */

import { detectProactiveFindings, type ProactiveFinding } from '@/lib/jarvis/workers/proactive'
import { attentionFingerprint } from '@/lib/jarvis/autonomous/fingerprint'
import { buildDiagnosis } from '@/lib/jarvis/autonomous/diagnosis'
import type { AttentionItem, OperatorSeverity } from '@/lib/jarvis/autonomous/types'

export type AnomalyDetectionInput = Parameters<typeof detectProactiveFindings>[0] & {
  contentBlocked?: number
  contentNeedsReview?: number
  publishStoppedDays?: number | null
  renderFailures?: number
  igSyncStaleHours?: number | null
  shopifyError?: boolean
  researchBudgetExhausted?: boolean
}

export function detectBusinessAnomalies(input: AnomalyDetectionInput): {
  severity: OperatorSeverity | 'NONE'
  findings: ProactiveFinding[]
  attention: AttentionItem[]
  shouldNotify: boolean
} {
  const base = detectProactiveFindings(input)
  const findings = [...base.findings]

  if ((input.contentBlocked ?? 0) > 0) {
    findings.push({
      severity: 'WARNING',
      title: 'Content pipeline blocked',
      detail: `${input.contentBlocked} content item(s) have blocking reasons`,
      source: 'content_ops.queue',
    })
  }
  if ((input.contentNeedsReview ?? 0) >= 3) {
    findings.push({
      severity: 'NOTICE',
      title: 'Multiple content items awaiting review',
      detail: `${input.contentNeedsReview} items in REVIEW / REVISION_REQUESTED`,
      source: 'content_ops.queue',
    })
  }
  if (input.publishStoppedDays != null && input.publishStoppedDays >= 7) {
    findings.push({
      severity: 'NOTICE',
      title: 'Instagram publishing quiet',
      detail: `No published content observed for ~${input.publishStoppedDays} days (observation only — not a virality claim).`,
      source: 'content_ops.publish',
    })
  }
  if ((input.renderFailures ?? 0) > 0) {
    findings.push({
      severity: 'WARNING',
      title: 'Video render failures',
      detail: `${input.renderFailures} recent failed/stuck render job(s)`,
      source: 'video.editor',
    })
  }
  if (input.igSyncStaleHours != null && input.igSyncStaleHours >= 48) {
    findings.push({
      severity: 'WARNING',
      title: 'Instagram metrics stale',
      detail: `Instagram metrics have not synced for ~${Math.round(input.igSyncStaleHours)}h. Current performance cannot be verified — do not assume a drop.`,
      source: 'instagram.sync',
    })
  }
  if (input.shopifyError) {
    findings.push({
      severity: 'NOTICE',
      title: 'Shopify integration error',
      detail: 'Shopify query failed or degraded. Shopify is not LURVOX coaching revenue.',
      source: 'shopify.integration',
    })
  }
  if (input.researchBudgetExhausted) {
    findings.push({
      severity: 'WARNING',
      title: 'Research budget exhausted',
      detail: 'Further research will PAUSED_BUDGET until budget allows.',
      source: 'jarvis.cost',
    })
  }

  let severity: OperatorSeverity | 'NONE' = base.severity
  const order: OperatorSeverity[] = ['INFO', 'NOTICE', 'WARNING', 'CRITICAL']
  for (const f of findings) {
    if (severity === 'NONE') severity = f.severity
    else if (order.indexOf(f.severity) > order.indexOf(severity as OperatorSeverity)) {
      severity = f.severity
    }
  }

  const attention = findings.map((f) => findingToAttention(f))
  const shouldNotify =
    severity === 'NOTICE' || severity === 'WARNING' || severity === 'CRITICAL'

  return { severity, findings, attention, shouldNotify }
}

export function findingToAttention(f: ProactiveFinding): AttentionItem {
  const requiresApproval =
    f.severity === 'CRITICAL' ||
    /budget|spend|publish|cpa above max/i.test(f.title + f.detail)

  return {
    fingerprint: attentionFingerprint({
      system: f.source.split('.')[0] || 'jarvis',
      title: f.title,
      key: f.source,
    }),
    severity: f.severity,
    system: f.source.split('.')[0]?.toUpperCase() || 'JARVIS',
    title: f.title,
    observation: f.detail,
    evidence: [`source=${f.source}`, f.detail],
    next_action:
      f.severity === 'CRITICAL' || f.severity === 'WARNING'
        ? 'Investigate'
        : 'Monitor',
    requires_approval: requiresApproval,
    status: 'open',
    diagnosis: buildDiagnosis({
      observed: [f.detail],
      inferred: [],
      uncertain: ['Causal root cause not established from this signal alone.'],
      recommendation: [
        f.severity === 'CRITICAL' || f.severity === 'WARNING'
          ? `Investigate ${f.title} using existing SOTs; prepare recommendation — do not auto-apply significant changes.`
          : 'Continue observation; notify only if severity rises.',
      ],
    }),
  }
}

export function isSignificantForInvestigation(sev: OperatorSeverity | 'NONE'): boolean {
  return sev === 'WARNING' || sev === 'CRITICAL'
}
