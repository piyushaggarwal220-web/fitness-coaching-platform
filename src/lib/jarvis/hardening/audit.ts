/**
 * Phase 22 — Production hardening audits (offline / deterministic).
 * No external writes. No live Meta/IG enablement.
 */

import { FORBIDDEN_TOOL_NAMES, listTools } from '@/lib/jarvis/tools/registry'
import { ensureJarvisToolsRegistered } from '@/lib/jarvis/tools/builtins'
import { evaluateExecutionPolicy } from '@/lib/jarvis/execution/policy/evaluate'
import { liveMetaExecutionEnabled } from '@/lib/ai-marketing/autonomy'
import { liveInstagramPublishingEnabled } from '@/lib/jarvis/instagram'
import { validateMemoryWrite, hierarchyLevelForKind } from '@/lib/jarvis/memory/kinds'
import { canPromoteToOperatingRule, canPromoteToPattern } from '@/lib/jarvis/memory/strategic/evidence'
import { opportunityBusinessFingerprint } from '@/lib/jarvis/opportunities/store'
import { validateHypothesis, assessDataSufficiency } from '@/lib/jarvis/experiments'
import { prioritizeItems, assessPlanHealth } from '@/lib/jarvis/strategy/long-horizon'
import type { PolicyFacts } from '@/lib/jarvis/execution/policy/types'
import type { JarvisRiskClass } from '@/lib/jarvis/types'

function basePolicy(overrides: Partial<PolicyFacts> = {}): PolicyFacts {
  return {
    tool_name: 'meta.increase_budget',
    action_class: 'AD_BUDGET_INCREASE',
    system: 'META',
    risk_class: 'SIGNIFICANT',
    risk_level: 'high',
    estimated_cost_usd: 0.1,
    money_impact_usd: 500,
    percent_change: 20,
    autonomy_level: 4,
    source: 'chat',
    approved_execution: false,
    live_meta_enabled: false,
    live_instagram_publishing: false,
    shopify_writes_enabled: true,
    video_publish_enabled: false,
    execution_kill_switch: false,
    execution_mode: 'approval',
    dry_run: false,
    shadow_mode: false,
    canary_enabled: false,
    reversibility: 'REVERSIBLE',
    recent_failures: 0,
    duplicate_running: false,
    already_succeeded: false,
    ...overrides,
  }
}

export type AuditFinding = {
  id: string
  area: string
  status: 'PASS' | 'WARN' | 'FAIL'
  detail: string
}

export function auditPermissionMatrix(): {
  findings: AuditFinding[]
  matrix: Record<JarvisRiskClass | 'FORBIDDEN', string[]>
} {
  ensureJarvisToolsRegistered()
  const tools = listTools()
  const matrix: Record<string, string[]> = {
    READ: [],
    LOW_RISK: [],
    SIGNIFICANT: [],
    DANGEROUS: [],
    FORBIDDEN: [...FORBIDDEN_TOOL_NAMES],
  }
  for (const t of tools) {
    matrix[t.riskClass] = matrix[t.riskClass] || []
    matrix[t.riskClass].push(t.name)
  }
  const findings: AuditFinding[] = []
  if (tools.some((t) => t.name === 'opportunities.execute' || t.name === 'experiments.execute_meta')) {
    findings.push({
      id: 'no_bypass_execute',
      area: 'permissions',
      status: 'FAIL',
      detail: 'Forbidden execute-style tool registered',
    })
  } else {
    findings.push({
      id: 'no_bypass_execute',
      area: 'permissions',
      status: 'PASS',
      detail: 'No unrestricted opportunity/experiment execute tools',
    })
  }
  if (!tools.find((t) => t.name === 'system.raise_budget') && FORBIDDEN_TOOL_NAMES.has('system.raise_budget')) {
    findings.push({
      id: 'forbidden_budget',
      area: 'permissions',
      status: 'PASS',
      detail: 'system.raise_budget remains forbidden',
    })
  }
  return { findings, matrix: matrix as Record<JarvisRiskClass | 'FORBIDDEN', string[]> }
}

export function auditExecutionSafety(): AuditFinding[] {
  const findings: AuditFinding[] = []
  const blocked = evaluateExecutionPolicy(basePolicy())
  findings.push({
    id: 'phase12_blocks_auto_meta',
    area: 'execution',
    status: blocked.decision === 'AUTO_EXECUTE' ? 'FAIL' : 'PASS',
    detail: `Policy decision=${blocked.decision} (live Meta false, no approval)`,
  })
  const kill = evaluateExecutionPolicy(basePolicy({ execution_kill_switch: true, approved_execution: true }))
  findings.push({
    id: 'kill_switch',
    area: 'execution',
    status: kill.decision === 'AUTO_EXECUTE' ? 'FAIL' : 'PASS',
    detail: `Kill switch decision=${kill.decision}`,
  })
  findings.push({
    id: 'live_meta',
    area: 'execution',
    status: liveMetaExecutionEnabled() ? 'FAIL' : 'PASS',
    detail: `LIVE_META=${liveMetaExecutionEnabled()}`,
  })
  findings.push({
    id: 'live_ig',
    area: 'execution',
    status: liveInstagramPublishingEnabled() ? 'FAIL' : 'PASS',
    detail: `LIVE_IG=${liveInstagramPublishingEnabled()}`,
  })
  return findings
}

export function auditMemoryIntegrity(): AuditFinding[] {
  const findings: AuditFinding[] = []
  findings.push({
    id: 'hierarchy',
    area: 'memory',
    status: hierarchyLevelForKind('OPERATING_RULE') === 5 ? 'PASS' : 'FAIL',
    detail: 'Hierarchy levels intact',
  })
  findings.push({
    id: 'anti_causality',
    area: 'memory',
    status: validateMemoryWrite({
      kind: 'HYPOTHESIS',
      source: 'learning',
      summary: 'X causes Y',
    }).ok
      ? 'FAIL'
      : 'PASS',
    detail: 'Causal language rejected on hypotheses',
  })
  findings.push({
    id: 'research_not_rule',
    area: 'memory',
    status: canPromoteToOperatingRule({
      sampleSize: 99,
      confidence: 'VERY_HIGH',
      source_type: 'RESEARCH',
    })
      ? 'FAIL'
      : 'PASS',
    detail: 'External research cannot mint operating rules',
  })
  findings.push({
    id: 'pattern_threshold',
    area: 'memory',
    status: !canPromoteToPattern(1) && canPromoteToPattern(3) ? 'PASS' : 'FAIL',
    detail: 'Pattern requires ≥3 observations',
  })
  return findings
}

export function auditFunnelIsolation(): AuditFinding[] {
  const a = opportunityBusinessFingerprint({
    type: 'MARKETING_EFFICIENCY',
    funnel_id: 'funnel_99',
    key: 'cpa',
  })
  const b = opportunityBusinessFingerprint({
    type: 'MARKETING_EFFICIENCY',
    funnel_id: 'funnel_1699',
    key: 'cpa',
  })
  const u = opportunityBusinessFingerprint({
    type: 'MARKETING_EFFICIENCY',
    funnel_id: null,
    key: 'cpa',
  })
  return [
    {
      id: 'funnel_fingerprint_isolation',
      area: 'funnel',
      status: a !== b && a !== u && b !== u ? 'PASS' : 'FAIL',
      detail: '₹99 / ₹1699 / UNCLASSIFIED fingerprints differ',
    },
  ]
}

export function auditExperimentIntegrity(): AuditFinding[] {
  return [
    {
      id: 'hypothesis_quality',
      area: 'experiments',
      status: validateHypothesis('just try it').ok ? 'FAIL' : 'PASS',
      detail: 'Vague hypotheses rejected',
    },
    {
      id: 'insufficient_data',
      area: 'experiments',
      status:
        assessDataSufficiency({
          purchases: 1,
          spend: 10,
          minimum_purchases: 5,
          minimum_spend: 500,
        }) === 'INSUFFICIENT'
          ? 'PASS'
          : 'FAIL',
      detail: 'Tiny samples stay INSUFFICIENT',
    },
  ]
}

export function auditPlanIntegrity(): AuditFinding[] {
  const health = assessPlanHealth({
    status: 'ACTIVE',
    milestones: [],
    dependencies: [],
    risks: [],
    goalStatuses: [],
    openBlockers: 0,
    experimentsInconclusive: 0,
    metricAvailable: false,
  })
  const blocked = assessPlanHealth({
    status: 'ACTIVE',
    milestones: [],
    dependencies: [{ status: 'blocked' }],
    risks: [],
    goalStatuses: ['ACTIVE'],
    openBlockers: 2,
    experimentsInconclusive: 0,
    metricAvailable: true,
  })
  const pri = prioritizeItems([
    { id: '1', title: 'x', urgency: 'CRITICAL', impact: 'HIGH' },
    { id: '2', title: 'y', urgency: 'LOW', impact: 'LOW' },
  ])
  return [
    {
      id: 'unknown_without_metrics',
      area: 'plans',
      status: health.health === 'UNKNOWN' ? 'PASS' : 'FAIL',
      detail: 'No fabricated progress when metrics unavailable',
    },
    {
      id: 'blockers_surface',
      area: 'plans',
      status: blocked.health === 'BLOCKED' ? 'PASS' : 'FAIL',
      detail: 'Open blockers → BLOCKED health',
    },
    {
      id: 'priority_explained',
      area: 'plans',
      status: pri[0].band === 'CRITICAL' && pri[0].reasons.length > 0 ? 'PASS' : 'FAIL',
      detail: 'Priority bands include explanations',
    },
  ]
}

export function auditSecretPatterns(): AuditFinding[] {
  const samples = [
    'Bearer sk-abc',
    'api_key=secret',
    'normal business text CPA rose',
  ]
  const blocked = samples.filter((s) =>
    /\b(api[_-]?key|access[_-]?token|Bearer\s+[A-Za-z0-9._-]+)\b/i.test(s)
  )
  return [
    {
      id: 'secret_pattern_detection',
      area: 'security',
      status: blocked.length === 2 ? 'PASS' : 'WARN',
      detail: `Secret-like samples flagged: ${blocked.length}/2 expected`,
    },
  ]
}

export function runHardeningAudit(): {
  ok: boolean
  findings: AuditFinding[]
  failed: AuditFinding[]
  warned: AuditFinding[]
} {
  const findings = [
    ...auditPermissionMatrix().findings,
    ...auditExecutionSafety(),
    ...auditMemoryIntegrity(),
    ...auditFunnelIsolation(),
    ...auditExperimentIntegrity(),
    ...auditPlanIntegrity(),
    ...auditSecretPatterns(),
  ]
  const failed = findings.filter((f) => f.status === 'FAIL')
  const warned = findings.filter((f) => f.status === 'WARN')
  return { ok: failed.length === 0, findings, failed, warned }
}
