import type { MetaIntegrationStatus } from '@/lib/ai-marketing/types'

export type MetaCredentials = {
  accessToken: string
  adAccountId: string
  apiVersion: string
}

export function getMetaCredentials():
  | { ok: true; credentials: MetaCredentials }
  | { ok: false; missing: string[] } {
  const accessToken =
    process.env.META_ADS_ACCESS_TOKEN?.trim() ||
    process.env.META_MARKETING_ACCESS_TOKEN?.trim() ||
    ''
  const rawAccount =
    process.env.META_ADS_AD_ACCOUNT_ID?.trim() ||
    process.env.META_AD_ACCOUNT_ID?.trim() ||
    ''
  const apiVersion =
    process.env.META_ADS_API_VERSION?.trim() ||
    process.env.META_CONVERSIONS_API_VERSION?.trim() ||
    'v22.0'

  const missing: string[] = []
  if (!accessToken) missing.push('META_ADS_ACCESS_TOKEN')
  if (!rawAccount) missing.push('META_ADS_AD_ACCOUNT_ID')

  if (missing.length) return { ok: false, missing }

  const adAccountId = rawAccount.startsWith('act_') ? rawAccount : `act_${rawAccount}`
  return {
    ok: true,
    credentials: { accessToken, adAccountId, apiVersion },
  }
}

export function getMetaIntegrationStatus(metaState?: {
  last_sync_at?: string | null
  last_sync_error?: string | null
}): MetaIntegrationStatus {
  const creds = getMetaCredentials()
  const pageId = process.env.META_ADS_PAGE_ID?.trim() || ''
  const writeMissing: string[] = []
  if (!pageId) writeMissing.push('META_ADS_PAGE_ID')
  if (!process.env.META_ADS_DEFAULT_LINK_URL?.trim()) {
    writeMissing.push('META_ADS_DEFAULT_LINK_URL (optional — falls back to funnel landing_page)')
  }

  if (!creds.ok) {
    return {
      configured: false,
      missing: creds.missing,
      writeMissing,
      adAccountId: null,
      apiVersion:
        process.env.META_ADS_API_VERSION?.trim() ||
        process.env.META_CONVERSIONS_API_VERSION?.trim() ||
        'v22.0',
      lastSyncAt: metaState?.last_sync_at ?? null,
      lastSyncError: metaState?.last_sync_error ?? null,
      mode: 'unconfigured',
      liveExecutionEnabled: process.env.LIVE_META_EXECUTION_ENABLED === 'true',
      pageIdConfigured: Boolean(pageId),
    }
  }
  return {
    configured: true,
    missing: [],
    writeMissing,
    adAccountId: creds.credentials.adAccountId,
    apiVersion: creds.credentials.apiVersion,
    lastSyncAt: metaState?.last_sync_at ?? null,
    lastSyncError: metaState?.last_sync_error ?? null,
    mode: 'live',
    liveExecutionEnabled: process.env.LIVE_META_EXECUTION_ENABLED === 'true',
    pageIdConfigured: Boolean(pageId),
  }
}

export class MetaApiError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly body?: unknown
  ) {
    super(message)
    this.name = 'MetaApiError'
  }
}

export type MetaGraphClient = {
  get: <T = unknown>(path: string, query?: Record<string, string>) => Promise<T>
  post: <T = unknown>(path: string, body?: Record<string, unknown>) => Promise<T>
  credentials: MetaCredentials
  timeoutMs: number
}

export type MetaGraphClientOptions = {
  /** Per-request AbortSignal timeout. Default 20s. */
  timeoutMs?: number
}

export function createMetaGraphClient(
  credentials: MetaCredentials,
  opts?: MetaGraphClientOptions
): MetaGraphClient {
  const base = `https://graph.facebook.com/${credentials.apiVersion}`
  const timeoutMs = opts?.timeoutMs ?? 20_000

  async function request<T>(
    method: 'GET' | 'POST',
    path: string,
    queryOrBody?: Record<string, unknown>
  ): Promise<T> {
    const url = new URL(`${base}${path.startsWith('/') ? path : `/${path}`}`)
    const headers: Record<string, string> = {}

    let init: RequestInit
    if (method === 'GET') {
      url.searchParams.set('access_token', credentials.accessToken)
      if (queryOrBody) {
        for (const [k, v] of Object.entries(queryOrBody)) {
          if (v === undefined || v === null) continue
          url.searchParams.set(k, typeof v === 'string' ? v : JSON.stringify(v))
        }
      }
      init = { method: 'GET' }
    } else {
      const form = new URLSearchParams()
      form.set('access_token', credentials.accessToken)
      if (queryOrBody) {
        for (const [k, v] of Object.entries(queryOrBody)) {
          if (v === undefined || v === null) continue
          form.set(k, typeof v === 'string' ? v : JSON.stringify(v))
        }
      }
      headers['Content-Type'] = 'application/x-www-form-urlencoded'
      init = { method: 'POST', headers, body: form.toString() }
    }

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const res = await fetch(url.toString(), { ...init, signal: controller.signal })
      const json = (await res.json().catch(() => null)) as
        | { error?: { message?: string; code?: number }; [k: string]: unknown }
        | null

      if (!res.ok || json?.error) {
        throw new MetaApiError(
          json?.error?.message || `Meta API ${method} ${path} failed (${res.status})`,
          res.status,
          // Never attach raw body with tokens; keep error code only
          json?.error ? { code: json.error.code, message: json.error.message } : { status: res.status }
        )
      }
      return json as T
    } catch (err) {
      if (err instanceof MetaApiError) throw err
      if (err instanceof Error && (err.name === 'AbortError' || /aborted/i.test(err.message))) {
        throw new MetaApiError(`Meta API ${method} ${path} timed out after ${timeoutMs}ms`, 408)
      }
      throw err
    } finally {
      clearTimeout(timer)
    }
  }

  return {
    credentials,
    timeoutMs,
    get: (path, query) => request('GET', path, query),
    post: (path, body) => request('POST', path, body),
  }
}

/** Insights field set used for normalized performance ingestion. */
export const META_INSIGHT_FIELDS = [
  'campaign_id',
  'campaign_name',
  'adset_id',
  'adset_name',
  'ad_id',
  'ad_name',
  'spend',
  'impressions',
  'reach',
  'clicks',
  'ctr',
  'cpc',
  'cpm',
  'frequency',
  'actions',
  'action_values',
  'purchase_roas',
  'date_start',
  'date_stop',
].join(',')

export type MetaInsightRow = {
  campaign_id?: string
  campaign_name?: string
  adset_id?: string
  adset_name?: string
  ad_id?: string
  ad_name?: string
  spend?: string
  impressions?: string
  reach?: string
  clicks?: string
  ctr?: string
  cpc?: string
  cpm?: string
  frequency?: string
  actions?: { action_type: string; value: string }[]
  action_values?: { action_type: string; value: string }[]
  purchase_roas?: { action_type: string; value: string }[]
  date_start?: string
  date_stop?: string
}

export function extractPurchasesAndRevenue(row: MetaInsightRow): {
  purchases: number
  revenue: number
} {
  const purchaseTypes = new Set([
    'purchase',
    'omni_purchase',
    'offsite_conversion.fb_pixel_purchase',
  ])
  let purchases = 0
  for (const a of row.actions ?? []) {
    if (purchaseTypes.has(a.action_type)) {
      purchases += Number(a.value) || 0
    }
  }
  let revenue = 0
  for (const a of row.action_values ?? []) {
    if (purchaseTypes.has(a.action_type)) {
      revenue += Number(a.value) || 0
    }
  }
  return { purchases, revenue }
}
