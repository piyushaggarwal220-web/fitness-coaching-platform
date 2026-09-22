/**
 * Proactive anomaly detection with severity — no spam.
 */

export type ProactiveSeverity = 'INFO' | 'NOTICE' | 'WARNING' | 'CRITICAL'

export type ProactiveFinding = {
  severity: ProactiveSeverity
  title: string
  detail: string
  source: string
}

function maxSeverity(a: ProactiveSeverity, b: ProactiveSeverity): ProactiveSeverity {
  const order: ProactiveSeverity[] = ['INFO', 'NOTICE', 'WARNING', 'CRITICAL']
  return order.indexOf(a) >= order.indexOf(b) ? a : b
}

export function detectProactiveFindings(input: {
  funnelPerformance: {
    byFunnel: {
      funnel_name: string
      classified: boolean
      spend: number
      cpa: number | null
      max_acceptable_cpa: number | null
      target_cpa: number | null
      initial_roas: number | null
      target_roas: number | null
    }[]
    unclassified: { spend: number }
  }
  lurvox?: {
    ok: boolean
    today_gross_inr?: number | null
    yesterday_gross_inr?: number | null
    data_status?: string
  } | null
  pendingApprovals?: number
  failedJobs?: number
  metaConfigured?: boolean
  metaLastSyncAt?: string | null
  budgetNearExhaustion?: boolean
}): {
  severity: ProactiveSeverity | 'NONE'
  findings: ProactiveFinding[]
  shouldNotify: boolean
} {
  const findings: ProactiveFinding[] = []
  let severity: ProactiveSeverity | 'NONE' = 'NONE'

  for (const f of input.funnelPerformance.byFunnel) {
    if (!f.classified || f.spend <= 0) continue

    if (
      f.cpa != null &&
      f.max_acceptable_cpa != null &&
      f.cpa > f.max_acceptable_cpa &&
      f.spend >= 500
    ) {
      findings.push({
        severity: 'CRITICAL',
        title: `${f.funnel_name}: CPA above max`,
        detail: `CPA ₹${f.cpa.toFixed(0)} > max ₹${f.max_acceptable_cpa} (spend ₹${f.spend.toFixed(0)})`,
        source: 'meta.funnel_performance',
      })
      severity = maxSeverity(severity === 'NONE' ? 'INFO' : severity, 'CRITICAL')
    } else if (
      f.cpa != null &&
      f.target_cpa != null &&
      f.cpa > f.target_cpa * 1.35 &&
      f.spend >= 300
    ) {
      findings.push({
        severity: 'WARNING',
        title: `${f.funnel_name}: CPA well above target`,
        detail: `CPA ₹${f.cpa.toFixed(0)} vs target ₹${f.target_cpa}`,
        source: 'meta.funnel_performance',
      })
      severity = maxSeverity(severity === 'NONE' ? 'INFO' : severity, 'WARNING')
    }

    if (
      f.initial_roas != null &&
      f.target_roas != null &&
      f.initial_roas < f.target_roas * 0.6 &&
      f.spend >= 500
    ) {
      findings.push({
        severity: 'WARNING',
        title: `${f.funnel_name}: ROAS far below target`,
        detail: `ROAS ${f.initial_roas.toFixed(2)} vs target ${f.target_roas}`,
        source: 'meta.funnel_performance',
      })
      severity = maxSeverity(severity === 'NONE' ? 'INFO' : severity, 'WARNING')
    }
  }

  if (input.funnelPerformance.unclassified.spend > 1000) {
    findings.push({
      severity: 'NOTICE',
      title: 'Unclassified Meta spend',
      detail: `₹${input.funnelPerformance.unclassified.spend.toFixed(0)} spend needs campaign classification`,
      source: 'meta.unclassified',
    })
    severity = maxSeverity(severity === 'NONE' ? 'INFO' : severity, 'NOTICE')
  }

  if (
    input.lurvox?.ok &&
    typeof input.lurvox.today_gross_inr === 'number' &&
    typeof input.lurvox.yesterday_gross_inr === 'number' &&
    input.lurvox.yesterday_gross_inr > 2000 &&
    input.lurvox.today_gross_inr < input.lurvox.yesterday_gross_inr * 0.4
  ) {
    findings.push({
      severity: 'WARNING',
      title: 'LURVOX revenue drop vs yesterday',
      detail: `Today ₹${input.lurvox.today_gross_inr.toFixed(0)} vs yesterday ₹${input.lurvox.yesterday_gross_inr.toFixed(0)} (IST). Investigate — do not assume cause.`,
      source: 'lurvox.purchases',
    })
    severity = maxSeverity(severity === 'NONE' ? 'INFO' : severity, 'WARNING')
  }

  if (input.metaConfigured && !input.metaLastSyncAt) {
    findings.push({
      severity: 'WARNING',
      title: 'Meta sync never completed',
      detail: 'lastSyncAt is null — ad metrics may be unavailable',
      source: 'meta.integration',
    })
    severity = maxSeverity(severity === 'NONE' ? 'INFO' : severity, 'WARNING')
  }

  if ((input.pendingApprovals ?? 0) >= 3) {
    findings.push({
      severity: 'NOTICE',
      title: 'Multiple approvals pending',
      detail: `${input.pendingApprovals} significant actions waiting`,
      source: 'jarvis.approvals',
    })
    severity = maxSeverity(severity === 'NONE' ? 'INFO' : severity, 'NOTICE')
  }

  if ((input.failedJobs ?? 0) > 0) {
    findings.push({
      severity: 'WARNING',
      title: 'Background job failures',
      detail: `${input.failedJobs} recent failed jarvis background job(s)`,
      source: 'jarvis.background_jobs',
    })
    severity = maxSeverity(severity === 'NONE' ? 'INFO' : severity, 'WARNING')
  }

  if (input.budgetNearExhaustion) {
    findings.push({
      severity: 'CRITICAL',
      title: 'AI budget nearly exhausted',
      detail: 'Further autonomous work will pause (paused_budget)',
      source: 'jarvis.cost',
    })
    severity = maxSeverity(severity === 'NONE' ? 'INFO' : severity, 'CRITICAL')
  }

  // Notify only for NOTICE+ (suppress INFO spam)
  const shouldNotify =
    severity === 'NOTICE' || severity === 'WARNING' || severity === 'CRITICAL'

  return { severity, findings, shouldNotify }
}

export function notificationKindForSeverity(
  severity: ProactiveSeverity
): 'info' | 'alert' | 'cost' {
  if (severity === 'CRITICAL' || severity === 'WARNING') return 'alert'
  if (severity === 'NOTICE') return 'info'
  return 'info'
}
