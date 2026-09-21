import {
  createMetaGraphClient,
  getMetaCredentials,
  getMetaIntegrationStatus,
  META_INSIGHT_FIELDS,
} from '@/lib/ai-marketing/meta/client'
import type { MetaIntegrationStatus } from '@/lib/ai-marketing/types'
import { getSetting } from '@/lib/ai-marketing/settings'
import { liveMetaExecutionEnabled } from '@/lib/ai-marketing/autonomy'
import { createAdminClient } from '@/lib/supabase/admin'
import { redactDiagnosticText, redactDiagnosticValue } from '@/lib/jarvis/diagnostics/redact'
import type {
  DataStatus,
  DiagnosticEvidence,
  DiagnosticFinding,
  ProposedRemediation,
  RootCauseResult,
} from '@/lib/jarvis/diagnostics/diagnostic-types'
import type { PipelineTrace } from '@/lib/jarvis/diagnostics/root-cause-engine'

function evidence(
  system: string,
  observation: string,
  payload?: unknown,
  data_status?: DataStatus
): DiagnosticEvidence {
  return {
    id: `ev-${Math.random().toString(36).slice(2, 8)}`,
    stage: 'investigate',
    system,
    observation,
    data_status,
    payload: payload == null ? undefined : redactDiagnosticValue(payload),
    at: new Date().toISOString(),
  }
}

function finding(
  id: string,
  title: string,
  severity: DiagnosticFinding['severity'],
  system: string,
  detail: string,
  data_status?: DataStatus
): DiagnosticFinding {
  return { id, title, severity, system, detail, data_status }
}

export type MetaSyncProbeResult = {
  ok: boolean
  data_status: DataStatus
  observation: string
  payload?: unknown
}

export type MetaSyncProbes = {
  adAccount?: () => Promise<MetaSyncProbeResult>
  campaigns?: () => Promise<MetaSyncProbeResult>
  insights?: () => Promise<MetaSyncProbeResult>
}

/** Load Meta status with persisted sync timestamps from marketing_settings. */
export async function loadMetaIntegrationStatus(): Promise<
  MetaIntegrationStatus & { liveMetaExecutionEnabled: boolean }
> {
  let metaState: { last_sync_at?: string | null; last_sync_error?: string | null } = {}
  try {
    metaState = await getSetting<{
      last_sync_at?: string | null
      last_sync_error?: string | null
    }>('meta_integration', {})
  } catch {
    // Unit tests / missing Supabase: credentials-only status still works.
    metaState = {}
  }
  return {
    ...getMetaIntegrationStatus(metaState),
    liveMetaExecutionEnabled: liveMetaExecutionEnabled(),
  }
}

function defaultProbes(credentials: {
  accessToken: string
  adAccountId: string
  apiVersion: string
}): MetaSyncProbes {
  const client = createMetaGraphClient(credentials)
  return {
    adAccount: async () => {
      try {
        const data = await client.get<{ id?: string; name?: string; account_status?: number }>(
          `/${credentials.adAccountId}`,
          { fields: 'id,name,account_status' }
        )
        return {
          ok: true,
          data_status: 'verified',
          observation: `Ad account readable: ${data.name ?? data.id ?? credentials.adAccountId}`,
          payload: { id: data.id, name: data.name, account_status: data.account_status },
        }
      } catch (err) {
        return {
          ok: false,
          data_status: 'failed',
          observation: redactDiagnosticText(
            err instanceof Error ? err.message : 'Ad account probe failed'
          ),
        }
      }
    },
    campaigns: async () => {
      try {
        const data = await client.get<{ data?: { id: string; name?: string }[] }>(
          `/${credentials.adAccountId}/campaigns`,
          { fields: 'id,name', limit: '3' }
        )
        const rows = data.data ?? []
        return {
          ok: true,
          data_status: 'verified',
          observation: `Campaigns readable: ${rows.length} sample row(s)`,
          payload: { sample_count: rows.length, sample_ids: rows.map((r) => r.id) },
        }
      } catch (err) {
        return {
          ok: false,
          data_status: 'failed',
          observation: redactDiagnosticText(
            err instanceof Error ? err.message : 'Campaigns probe failed'
          ),
        }
      }
    },
    insights: async () => {
      try {
        const data = await client.get<{ data?: unknown[] }>(`/${credentials.adAccountId}/insights`, {
          fields: META_INSIGHT_FIELDS,
          date_preset: 'yesterday',
          level: 'account',
          limit: '1',
        })
        const rows = data.data ?? []
        return {
          ok: true,
          data_status: 'verified',
          observation: `Insights readable: ${rows.length} row(s) for yesterday preset`,
          payload: { row_count: rows.length },
        }
      } catch (err) {
        return {
          ok: false,
          data_status: 'failed',
          observation: redactDiagnosticText(
            err instanceof Error ? err.message : 'Insights probe failed'
          ),
        }
      }
    },
  }
}

/**
 * Investigate Meta sync path with real evidence only.
 * Does not invent a cause when probes are incomplete.
 */
export async function investigateMetaSyncPipeline(
  problem: string,
  opts?: { probes?: MetaSyncProbes; skipLiveProbes?: boolean }
): Promise<PipelineTrace> {
  const evidenceList: DiagnosticEvidence[] = []
  const findings: DiagnosticFinding[] = []
  const remediations: ProposedRemediation[] = []

  evidenceList.push(
    evidence('orchestrator', 'User symptom captured for Meta sync pipeline.', { problem })
  )

  const status = await loadMetaIntegrationStatus()
  evidenceList.push(
    evidence(
      'meta.config',
      status.configured
        ? 'Meta credentials are present in environment.'
        : `Meta credentials missing: ${(status.missing ?? []).join(', ') || 'unknown'}`,
      {
        configured: status.configured,
        missing: status.missing,
        adAccountId: status.adAccountId,
        apiVersion: status.apiVersion,
        lastSyncAt: status.lastSyncAt,
        lastSyncError: status.lastSyncError,
        liveExecutionEnabled: status.liveMetaExecutionEnabled,
        pageIdConfigured: status.pageIdConfigured,
        writeMissing: status.writeMissing,
        mode: status.mode,
      },
      status.configured ? 'verified' : 'unavailable'
    )
  )

  if (!status.configured) {
    findings.push(
      finding(
        'meta_unconfigured',
        'Meta Ads is not configured',
        'high',
        'meta',
        'Missing Meta credentials. Ad metrics are unavailable — not ₹0 spend.',
        'unavailable'
      )
    )
    return finish(
      evidenceList,
      findings,
      remediations,
      'Meta is not configured, so sync cannot run. Cause of missing performance data: credentials absent.',
      'high',
      'meta.config'
    )
  }

  if (status.lastSyncAt == null) {
    findings.push(
      finding(
        'meta_never_synced',
        'Meta sync has no successful lastSyncAt',
        'high',
        'meta',
        status.lastSyncError
          ? `lastSyncAt is null. Last recorded sync error: ${redactDiagnosticText(status.lastSyncError)}`
          : 'lastSyncAt is null. No successful sync timestamp is stored in marketing_settings.meta_integration.',
        'unavailable'
      )
    )
  } else {
    evidenceList.push(
      evidence(
        'meta.sync_history',
        `Last successful sync timestamp: ${status.lastSyncAt}`,
        { lastSyncAt: status.lastSyncAt, lastSyncError: status.lastSyncError },
        'verified'
      )
    )
  }

  if (status.lastSyncError) {
    findings.push(
      finding(
        'meta_sync_error',
        'Meta sync recorded an error',
        'high',
        'meta',
        redactDiagnosticText(status.lastSyncError),
        'failed'
      )
    )
  }

  // Sync / audit history from DB (never invent)
  try {
    const admin = createAdminClient()
    const [{ data: audits }, { data: perfCount }] = await Promise.all([
      admin
        .from('marketing_audit_events')
        .select('decision, reasoning, error, created_at')
        .eq('agent', 'meta_sync')
        .order('created_at', { ascending: false })
        .limit(5),
      admin.from('marketing_performance').select('id', { count: 'exact', head: true }),
    ])
    evidenceList.push(
      evidence(
        'meta.sync_history',
        audits?.length
          ? `Found ${audits.length} recent meta_sync audit row(s).`
          : 'No meta_sync audit rows found — cannot prove a sync ever completed.',
        { audits: audits ?? [], marketing_performance_count: perfCount ?? null },
        audits?.length ? 'verified' : 'unknown'
      )
    )
    if (!audits?.length && status.lastSyncAt == null) {
      findings.push(
        finding(
          'meta_sync_never_completed',
          'No evidence of a completed Meta sync',
          'high',
          'meta',
          'Neither lastSyncAt nor meta_sync audit history shows a successful completion.',
          'unknown'
        )
      )
    }
  } catch (err) {
    evidenceList.push(
      evidence(
        'meta.sync_history',
        redactDiagnosticText(
          err instanceof Error ? err.message : 'Could not read sync audit history'
        ),
        undefined,
        'failed'
      )
    )
  }

  const creds = getMetaCredentials()
  if (creds.ok && !opts?.skipLiveProbes) {
    const probes = {
      ...defaultProbes(creds.credentials),
      ...opts?.probes,
    }
    for (const [name, run] of [
      ['ad_account', probes.adAccount],
      ['campaigns', probes.campaigns],
      ['insights', probes.insights],
    ] as const) {
      if (!run) continue
      try {
        const result = await run()
        evidenceList.push(
          evidence(`meta.${name}`, result.observation, result.payload, result.data_status)
        )
        if (!result.ok) {
          findings.push(
            finding(
              `meta_${name}_unreadable`,
              `Meta ${name.replace('_', ' ')} not readable`,
              'high',
              'meta',
              result.observation,
              result.data_status
            )
          )
        }
      } catch (err) {
        evidenceList.push(
          evidence(
            `meta.${name}`,
            redactDiagnosticText(err instanceof Error ? err.message : `${name} probe failed`),
            undefined,
            'failed'
          )
        )
      }
    }
  } else if (creds.ok && opts?.skipLiveProbes) {
    evidenceList.push(
      evidence(
        'meta.probes',
        'Live Meta Graph probes skipped for this run (test/offline mode). Accessibility of ad account/campaigns/insights remains unknown.',
        { skipped: true },
        'unknown'
      )
    )
  }

  const knownBreak =
    findings.find((f) => f.id === 'meta_unconfigured')?.id ||
    findings.find((f) => f.id === 'meta_sync_error')?.id ||
    findings.find((f) => f.id.endsWith('_unreadable'))?.id ||
    findings.find((f) => f.id === 'meta_never_synced')?.id ||
    null

  let summary: string
  let confidence: RootCauseResult['confidence']
  if (knownBreak === 'meta_unconfigured') {
    summary =
      'Meta performance is unavailable because credentials are not configured. This is not zero spend.'
    confidence = 'high'
  } else if (knownBreak === 'meta_sync_error') {
    summary = `Meta sync previously failed: ${redactDiagnosticText(status.lastSyncError || 'unknown error')}. Do not invent a deeper cause beyond this recorded error.`
    confidence = 'medium'
  } else if (knownBreak?.endsWith('_unreadable')) {
    summary =
      'Meta Graph probes failed for at least one required surface (ad account, campaigns, or insights). See evidence. Do not invent a specific Meta error code beyond what probes returned.'
    confidence = 'medium'
  } else if (status.lastSyncAt == null) {
    summary =
      'Meta performance is unavailable because lastSyncAt is null. Credentials may be present, but there is no verified successful sync. Exact blocker beyond "sync has not completed successfully" is unknown without a sync error or failed probe.'
    confidence = findings.some((f) => f.id.endsWith('_unreadable')) ? 'medium' : 'low'
  } else {
    summary =
      'Meta credentials and lastSyncAt are present. If marketing_performance still looks empty, the gap is not explained by missing sync timestamp — further row-level investigation is needed. Cause not invented.'
    confidence = 'low'
  }

  return finish(evidenceList, findings, remediations, summary, confidence, knownBreak)
}

function finish(
  evidenceList: DiagnosticEvidence[],
  findings: DiagnosticFinding[],
  remediations: ProposedRemediation[],
  summary: string,
  confidence: RootCauseResult['confidence'],
  pipeline_break: string | null
): PipelineTrace {
  return {
    evidence: evidenceList,
    findings,
    remediations,
    root: {
      summary,
      confidence,
      pipeline_break,
      findings,
      cannot_conclude_business: true,
    },
  }
}
