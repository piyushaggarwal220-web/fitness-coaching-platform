/**
 * Stage-level Meta sync diagnostics.
 * Never logs tokens, secrets, or PII.
 */

import { redactDiagnosticText, redactDiagnosticValue } from '@/lib/jarvis/diagnostics/redact'

export const META_SYNC_STAGES = [
  'START',
  'CONFIG_VALIDATION',
  'CAMPAIGN_FETCH',
  'ADSET_FETCH',
  'AD_FETCH',
  'INSIGHTS_FETCH',
  'PAGINATION',
  'RESPONSE_PARSING',
  'FUNNEL_CLASSIFICATION',
  'AGGREGATION',
  'PERFORMANCE_PERSISTENCE',
  'SYNC_AUDIT',
  'LAST_SYNC_AT_UPDATE',
  'COMPLETE',
] as const

export type MetaSyncStageName = (typeof META_SYNC_STAGES)[number]

export type MetaSyncStageStatus = 'pending' | 'running' | 'ok' | 'failed' | 'skipped' | 'timed_out'

export type MetaSyncErrorCategory =
  | 'timeout'
  | 'config'
  | 'network'
  | 'api'
  | 'parse'
  | 'persistence'
  | 'pagination'
  | 'unknown'

export type MetaSyncStageRecord = {
  stage: MetaSyncStageName
  started_at: string | null
  completed_at: string | null
  duration_ms: number | null
  status: MetaSyncStageStatus
  item_count: number | null
  page_count: number | null
  error_category: MetaSyncErrorCategory | null
  message: string | null
}

export type MetaSyncTrace = {
  run_id: string
  mode: 'full' | 'diagnostic'
  started_at: string
  completed_at: string | null
  total_duration_ms: number | null
  failed_stage: MetaSyncStageName | null
  stages: MetaSyncStageRecord[]
  api_ok: boolean
  persistence_ok: boolean
  last_sync_at_updated: boolean
  audit_written: boolean
  performance_rows_written: number
}

export function classifyMetaSyncError(err: unknown): MetaSyncErrorCategory {
  const msg = err instanceof Error ? err.message : String(err)
  const lower = msg.toLowerCase()
  if (lower.includes('timed out') || lower.includes('timeout') || lower.includes('aborted')) {
    return 'timeout'
  }
  if (lower.includes('not configured') || lower.includes('missing:')) return 'config'
  if (lower.includes('parse') || lower.includes('json') || lower.includes('invalid insight')) {
    return 'parse'
  }
  if (lower.includes('upsert') || lower.includes('persist') || lower.includes('supabase') || lower.includes('database')) {
    return 'persistence'
  }
  if (lower.includes('page') || lower.includes('pagination')) return 'pagination'
  if (lower.includes('fetch failed') || lower.includes('network') || lower.includes('econn')) {
    return 'network'
  }
  if (lower.includes('meta api') || lower.includes('graph') || lower.includes('(#') || /\b4\d\d\b/.test(msg)) {
    return 'api'
  }
  return 'unknown'
}

export function safeMetaSyncMessage(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err)
  return redactDiagnosticText(raw).slice(0, 500)
}

export class MetaSyncStageTracker {
  readonly run_id: string
  readonly mode: 'full' | 'diagnostic'
  readonly started_at: string
  private readonly stages = new Map<MetaSyncStageName, MetaSyncStageRecord>()
  failed_stage: MetaSyncStageName | null = null
  api_ok = false
  persistence_ok = false
  last_sync_at_updated = false
  audit_written = false
  performance_rows_written = 0

  constructor(mode: 'full' | 'diagnostic') {
    this.mode = mode
    this.run_id = `meta-sync-${Date.now().toString(36)}`
    this.started_at = new Date().toISOString()
    for (const stage of META_SYNC_STAGES) {
      this.stages.set(stage, {
        stage,
        started_at: null,
        completed_at: null,
        duration_ms: null,
        status: 'pending',
        item_count: null,
        page_count: null,
        error_category: null,
        message: null,
      })
    }
  }

  begin(stage: MetaSyncStageName, message?: string) {
    const row = this.stages.get(stage)!
    row.started_at = new Date().toISOString()
    row.status = 'running'
    row.message = message ? redactDiagnosticText(message).slice(0, 300) : null
  }

  end(
    stage: MetaSyncStageName,
    status: MetaSyncStageStatus,
    opts?: {
      item_count?: number | null
      page_count?: number | null
      message?: string | null
      error?: unknown
    }
  ) {
    const row = this.stages.get(stage)!
    row.completed_at = new Date().toISOString()
    row.status = status
    if (row.started_at) {
      row.duration_ms = Math.max(0, Date.parse(row.completed_at) - Date.parse(row.started_at))
    }
    if (opts?.item_count !== undefined) row.item_count = opts.item_count
    if (opts?.page_count !== undefined) row.page_count = opts.page_count
    if (opts?.message) row.message = redactDiagnosticText(opts.message).slice(0, 300)
    if (opts?.error) {
      row.error_category = classifyMetaSyncError(opts.error)
      row.message = safeMetaSyncMessage(opts.error)
    }
    if (status === 'failed' || status === 'timed_out') {
      this.failed_stage = stage
    }
  }

  skip(stage: MetaSyncStageName, message: string) {
    const row = this.stages.get(stage)!
    row.started_at = row.started_at ?? new Date().toISOString()
    row.completed_at = new Date().toISOString()
    row.duration_ms = 0
    row.status = 'skipped'
    row.message = redactDiagnosticText(message).slice(0, 300)
  }

  async run<T>(
    stage: MetaSyncStageName,
    fn: () => Promise<T>,
    opts?: { item_count?: (result: T) => number | null; page_count?: (result: T) => number | null }
  ): Promise<T> {
    this.begin(stage)
    try {
      const result = await fn()
      this.end(stage, 'ok', {
        item_count: opts?.item_count?.(result) ?? null,
        page_count: opts?.page_count?.(result) ?? null,
      })
      return result
    } catch (err) {
      const category = classifyMetaSyncError(err)
      this.end(stage, category === 'timeout' ? 'timed_out' : 'failed', { error: err })
      throw err
    }
  }

  finish(): MetaSyncTrace {
    const completed_at = new Date().toISOString()
    return {
      run_id: this.run_id,
      mode: this.mode,
      started_at: this.started_at,
      completed_at,
      total_duration_ms: Math.max(0, Date.parse(completed_at) - Date.parse(this.started_at)),
      failed_stage: this.failed_stage,
      stages: META_SYNC_STAGES.map((s) => this.stages.get(s)!),
      api_ok: this.api_ok,
      persistence_ok: this.persistence_ok,
      last_sync_at_updated: this.last_sync_at_updated,
      audit_written: this.audit_written,
      performance_rows_written: this.performance_rows_written,
    }
  }

  /** Safe for audit/diagnostics — no secrets. */
  toPublicPayload(): Record<string, unknown> {
    return redactDiagnosticValue(this.finish()) as Record<string, unknown>
  }
}

export type MetaSyncBounds = {
  requestTimeoutMs: number
  maxPages: number
  campaignLimit: number
  adsetLimit: number
  adLimit: number
  insightsLimit: number
  /** Max automatic retries per request (0 = no retry). */
  maxRetries: number
  datePreset: string
  includeCreatives: boolean
  refreshCreativePerformance: boolean
}

export const FULL_META_SYNC_BOUNDS: MetaSyncBounds = {
  requestTimeoutMs: 25_000,
  maxPages: 5,
  campaignLimit: 100,
  adsetLimit: 100,
  adLimit: 100,
  insightsLimit: 200,
  maxRetries: 0,
  datePreset: 'last_7d',
  includeCreatives: true,
  refreshCreativePerformance: true,
}

/** Smallest useful read-only dataset to prove the pipeline end-to-end. */
export const DIAGNOSTIC_META_SYNC_BOUNDS: MetaSyncBounds = {
  requestTimeoutMs: 15_000,
  maxPages: 1,
  campaignLimit: 5,
  adsetLimit: 10,
  adLimit: 10,
  insightsLimit: 25,
  maxRetries: 0,
  datePreset: 'yesterday',
  includeCreatives: false,
  refreshCreativePerformance: false,
}

export function withBoundedRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number
): Promise<T> {
  const attempts = Math.max(0, maxRetries) + 1
  let lastErr: unknown
  const run = async (i: number): Promise<T> => {
    try {
      return await fn()
    } catch (err) {
      lastErr = err
      if (i + 1 >= attempts) throw err
      return run(i + 1)
    }
  }
  return run(0).catch((err) => {
    throw lastErr ?? err
  })
}
