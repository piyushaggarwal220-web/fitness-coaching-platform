import type { DataStatus, MetricProvenance, ProvenancePeriod } from './diagnostic-types'

export { BUSINESS_TIMEZONE } from '@/lib/time/business-calendar'

const FAILED_STATUSES: DataStatus[] = ['failed', 'unavailable', 'unknown']

export function isUsableMetric(status: DataStatus): boolean {
  return status === 'verified' || status === 'partial' || status === 'stale'
}

/** API failure / missing payload must never become numeric zero. */
export function numericFromSource(input: {
  sourceValue: unknown
  dataStatus: DataStatus
}): number | null {
  if (FAILED_STATUSES.includes(input.dataStatus)) return null
  if (input.sourceValue == null) return null
  if (typeof input.sourceValue === 'number' && Number.isFinite(input.sourceValue)) {
    return input.sourceValue
  }
  if (typeof input.sourceValue === 'string' && input.sourceValue.trim() !== '') {
    const n = Number(input.sourceValue)
    return Number.isFinite(n) ? n : null
  }
  return null
}

export function metricProvenance(input: {
  metric: string
  value: number | null
  currency?: string | null
  period?: ProvenancePeriod | null
  timezone: string
  source: string
  tool_name?: string | null
  request_id?: string | null
  data_status: DataStatus
  confidence?: MetricProvenance['confidence']
  calculation_method: string
  sample_limit?: number | null
  note?: string
  source_timestamp?: string
}): MetricProvenance {
  const status = input.data_status
  const value = FAILED_STATUSES.includes(status) ? null : input.value
  return {
    metric: input.metric,
    value,
    currency: input.currency ?? null,
    period: input.period ?? null,
    timezone: input.timezone,
    source: input.source,
    source_timestamp: input.source_timestamp ?? new Date().toISOString(),
    query_period: input.period ?? null,
    tool_name: input.tool_name ?? null,
    request_id: input.request_id ?? null,
    data_status: status,
    confidence: input.confidence ?? (status === 'verified' ? 'high' : 'low'),
    calculation_method: input.calculation_method,
    sample_limit: input.sample_limit ?? null,
    note: input.note,
  }
}

export function unexpectedZero(input: {
  value: unknown
  data_status: DataStatus
  sourceExplicitZero: boolean
}): boolean {
  if (input.value !== 0 && input.value !== '0') return false
  if (FAILED_STATUSES.includes(input.data_status)) return true
  return !input.sourceExplicitZero
}

export function businessConclusionAllowed(status: DataStatus): boolean {
  return status === 'verified' || status === 'partial'
}
