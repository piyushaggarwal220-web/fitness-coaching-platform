/**
 * Shotstack Edit API client (server-only).
 * Never logs or returns VIDEO_EDIT_API_KEY.
 */

export type ShotstackErrorCode =
  | 'provider_unavailable'
  | 'authentication_failed'
  | 'invalid_request'
  | 'source_unavailable'
  | 'render_failed'
  | 'rate_limited'
  | 'timeout'
  | 'unsupported'
  | 'paused_budget'
  | 'not_configured'

export type ShotstackRenderStatus =
  | 'queued'
  | 'fetching'
  | 'rendering'
  | 'saving'
  | 'done'
  | 'failed'

export type ShotstackApiResult<T> = {
  ok: boolean
  status: number
  data?: T
  error_code?: ShotstackErrorCode
  error_message?: string
}

function redact(text: string, apiKey: string): string {
  let out = text
  if (apiKey) out = out.split(apiKey).join('[REDACTED_API_KEY]')
  out = out.replace(/x-api-key["']?\s*[:=]\s*["']?[^"'&\s]+/gi, 'x-api-key:[REDACTED]')
  return out.slice(0, 800)
}

export function getShotstackConfig(): {
  configured: boolean
  apiKey: string
  editBaseUrl: string
  serveBaseUrl: string
  callbackUrl: string | null
  stage: 'v1' | 'stage'
  costPerMinuteUsd: number
  missing: string[]
} {
  const apiKey = process.env.VIDEO_EDIT_API_KEY?.trim() || ''
  // Prefer explicit env; default v1 (production keys). Use SHOTSTACK_ENV=stage for sandbox keys.
  const stageRaw = (process.env.SHOTSTACK_ENV || process.env.VIDEO_EDIT_STAGE || 'v1').trim()
  const stage: 'v1' | 'stage' = stageRaw === 'stage' ? 'stage' : 'v1'
  const statusOverride = process.env.VIDEO_EDIT_STATUS_URL?.trim() || ''
  const editBaseUrl = statusOverride
    ? statusOverride.replace(/\/$/, '')
    : `https://api.shotstack.io/edit/${stage}`
  const serveBaseUrl = `https://api.shotstack.io/serve/${stage}`
  const callbackUrl = process.env.VIDEO_EDIT_WEBHOOK_URL?.trim() || null
  const costPerMinuteUsd = Math.min(
    Math.max(Number(process.env.SHOTSTACK_COST_PER_MINUTE_USD || '0.35') || 0.35, 0.01),
    5
  )
  const missing: string[] = []
  if (!apiKey) missing.push('VIDEO_EDIT_API_KEY')
  return {
    configured: Boolean(apiKey),
    apiKey,
    editBaseUrl,
    serveBaseUrl,
    callbackUrl,
    stage,
    costPerMinuteUsd,
    missing,
  }
}

function mapHttpError(status: number, bodyText: string): {
  error_code: ShotstackErrorCode
  error_message: string
} {
  if (status === 401 || status === 403) {
    return { error_code: 'authentication_failed', error_message: 'Shotstack authentication failed.' }
  }
  if (status === 429) {
    return { error_code: 'rate_limited', error_message: 'Shotstack rate limited.' }
  }
  if (status === 400 || status === 422) {
    return {
      error_code: 'invalid_request',
      error_message: bodyText.slice(0, 400) || 'Shotstack rejected the request.',
    }
  }
  if (status >= 500) {
    return { error_code: 'provider_unavailable', error_message: `Shotstack unavailable (${status}).` }
  }
  return {
    error_code: 'render_failed',
    error_message: bodyText.slice(0, 400) || `Shotstack error (${status}).`,
  }
}

async function shotstackFetch<T>(
  method: string,
  url: string,
  body?: unknown,
  timeoutMs = 45000
): Promise<ShotstackApiResult<T>> {
  const cfg = getShotstackConfig()
  if (!cfg.configured) {
    return {
      ok: false,
      status: 0,
      error_code: 'not_configured',
      error_message: 'VIDEO_EDIT_API_KEY missing.',
    }
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'x-api-key': cfg.apiKey,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    })
    const text = await res.text()
    const safeText = redact(text, cfg.apiKey)
    let json: unknown = null
    try {
      json = text ? JSON.parse(text) : null
    } catch {
      json = null
    }
    if (!res.ok) {
      const mapped = mapHttpError(res.status, safeText)
      return { ok: false, status: res.status, ...mapped }
    }
    return { ok: true, status: res.status, data: json as T }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (/abort|timeout/i.test(message)) {
      return { ok: false, status: 0, error_code: 'timeout', error_message: 'Shotstack request timed out.' }
    }
    return {
      ok: false,
      status: 0,
      error_code: 'provider_unavailable',
      error_message: redact(message, cfg.apiKey),
    }
  } finally {
    clearTimeout(timer)
  }
}

export type ShotstackProbeResponse = {
  success?: boolean
  message?: string
  response?: {
    metadata?: {
      streams?: Array<{
        codec_type?: string
        width?: number
        height?: number
        avg_frame_rate?: string
        r_frame_rate?: string
        duration?: string
        nb_frames?: string
      }>
      format?: {
        duration?: string
        format_name?: string
        size?: string
        bit_rate?: string
      }
    }
  }
}

export async function shotstackProbe(sourceUrl: string) {
  const cfg = getShotstackConfig()
  const encoded = encodeURIComponent(sourceUrl)
  return shotstackFetch<ShotstackProbeResponse>('GET', `${cfg.editBaseUrl}/probe/${encoded}`)
}

export type ShotstackQueuedResponse = {
  success?: boolean
  message?: string
  response?: { id?: string; message?: string; status?: string }
}

export async function shotstackCreateRender(edit: Record<string, unknown>) {
  const cfg = getShotstackConfig()
  return shotstackFetch<ShotstackQueuedResponse>('POST', `${cfg.editBaseUrl}/render`, edit)
}

export type ShotstackRenderResponse = {
  success?: boolean
  message?: string
  response?: {
    id?: string
    owner?: string
    status?: ShotstackRenderStatus | string
    url?: string | null
    error?: string | null
    poster?: string | null
    thumbnail?: string | null
    data?: unknown
    created?: string
    updated?: string
  }
}

export async function shotstackGetRender(renderId: string, includeData = false) {
  const cfg = getShotstackConfig()
  const q = includeData ? '?data=true' : '?data=false'
  return shotstackFetch<ShotstackRenderResponse>(
    'GET',
    `${cfg.editBaseUrl}/render/${encodeURIComponent(renderId)}${q}`
  )
}

export type ShotstackServeAssetsResponse = {
  success?: boolean
  response?: Array<{
    id?: string
    render?: string
    url?: string
    status?: string
  }>
  // some responses wrap differently
  data?: unknown
}

export async function shotstackGetServeAssetsByRender(renderId: string) {
  const cfg = getShotstackConfig()
  return shotstackFetch<ShotstackServeAssetsResponse>(
    'GET',
    `${cfg.serveBaseUrl}/assets/render/${encodeURIComponent(renderId)}`
  )
}

export function estimateShotstackCostUsd(durationSec: number): number {
  const cfg = getShotstackConfig()
  const minutes = Math.max(durationSec, 1) / 60
  // Round up to nearest cent, cap per-job estimate
  return Math.min(Math.ceil(minutes * cfg.costPerMinuteUsd * 100) / 100, 5)
}

export function mapShotstackStatusToJarvis(
  status: string | undefined | null
): 'queued' | 'rendering' | 'completed' | 'failed' | 'processing' {
  switch ((status || '').toLowerCase()) {
    case 'queued':
    case 'fetching':
      return 'queued'
    case 'rendering':
    case 'saving':
      return 'rendering'
    case 'done':
      return 'completed'
    case 'failed':
      return 'failed'
    default:
      return 'processing'
  }
}

export function buildShotstackCallbackUrl(jobId: string): string | null {
  const cfg = getShotstackConfig()
  if (!cfg.callbackUrl) return null
  try {
    const url = new URL(cfg.callbackUrl)
    // www.lurvox.in is Shopify marketing — Next.js APIs live on app.lurvox.in
    if (url.hostname === 'www.lurvox.in' || url.hostname === 'lurvox.in') {
      url.hostname = 'app.lurvox.in'
      console.warn(
        '[video] VIDEO_EDIT_WEBHOOK_URL host rewritten from marketing site to app.lurvox.in'
      )
    }
    if (!url.pathname.includes('/api/admin/jarvis/video-webhook')) {
      url.pathname = '/api/admin/jarvis/video-webhook'
    }
    url.searchParams.set('jarvis_job_id', jobId)
    const secret = process.env.VIDEO_EDIT_WEBHOOK_SECRET?.trim()
    if (secret) url.searchParams.set('token', secret)
    return url.toString()
  } catch {
    return cfg.callbackUrl
  }
}

/** Diagnose public webhook reachability without leaking secrets. */
export async function probeJarvisVideoWebhook(): Promise<{
  configured_url_host: string | null
  effective_url_host: string | null
  reachable: boolean
  auth_rejects_unauthenticated: boolean | null
  auth_rejects_bad_token: boolean | null
  auth_accepts_good_token: boolean | null
  http_status_unauthenticated: number | null
  http_status_bad_token: number | null
  http_status_good_token: number | null
  diagnosis: string
}> {
  const raw = process.env.VIDEO_EDIT_WEBHOOK_URL?.trim() || ''
  if (!raw) {
    return {
      configured_url_host: null,
      effective_url_host: null,
      reachable: false,
      auth_rejects_unauthenticated: null,
      auth_rejects_bad_token: null,
      auth_accepts_good_token: null,
      http_status_unauthenticated: null,
      http_status_bad_token: null,
      http_status_good_token: null,
      diagnosis: 'VIDEO_EDIT_WEBHOOK_URL not set',
    }
  }

  let configuredHost: string | null = null
  let effective = raw
  try {
    const u = new URL(raw)
    configuredHost = u.hostname
    if (u.hostname === 'www.lurvox.in' || u.hostname === 'lurvox.in') {
      u.hostname = 'app.lurvox.in'
    }
    u.pathname = '/api/admin/jarvis/video-webhook'
    u.search = ''
    effective = u.toString()
  } catch {
    return {
      configured_url_host: null,
      effective_url_host: null,
      reachable: false,
      auth_rejects_unauthenticated: null,
      auth_rejects_bad_token: null,
      auth_accepts_good_token: null,
      http_status_unauthenticated: null,
      http_status_bad_token: null,
      http_status_good_token: null,
      diagnosis: 'VIDEO_EDIT_WEBHOOK_URL is not a valid URL',
    }
  }

  const secret = process.env.VIDEO_EDIT_WEBHOOK_SECRET?.trim() || ''
  const fakeBody = {
    type: 'edit',
    action: 'render',
    id: '00000000-0000-4000-8000-000000000000',
    status: 'done',
    url: 'https://example.com/fake.mp4',
  }

  async function post(url: string, headers: Record<string, string> = {}) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(fakeBody),
    })
    return { status: res.status, text: (await res.text()).slice(0, 200) }
  }

  try {
    const noAuth = await post(effective)
    const bad = await post(`${effective}?token=wrong-token-value`)
    const goodUrl = new URL(effective)
    if (secret) goodUrl.searchParams.set('token', secret)
    const good = await post(goodUrl.toString())

    const is404 = noAuth.status === 404
    const reachable = !is404 && noAuth.status !== 0
    const authRejectsUnauth = secret ? noAuth.status === 401 : null
    const authRejectsBad = secret ? bad.status === 401 : null
    // Good token should NOT 401; may 400/200 depending on fake render verify
    const authAcceptsGood = secret ? good.status !== 401 && good.status !== 404 : null

    let diagnosis = ''
    if (configuredHost === 'www.lurvox.in' || configuredHost === 'lurvox.in') {
      diagnosis +=
        'Configured VIDEO_EDIT_WEBHOOK_URL points at marketing Shopify host; APIs must use app.lurvox.in. '
    }
    if (is404) {
      diagnosis +=
        `POST ${new URL(effective).host}/api/admin/jarvis/video-webhook returned HTTP 404 — route not deployed on production (app.lurvox.in). Deploy src/app/api/admin/jarvis/video-webhook before Shotstack can deliver callbacks.`
    } else if (secret && noAuth.status !== 401) {
      diagnosis += `Unauthenticated POST returned ${noAuth.status} (expected 401 when VIDEO_EDIT_WEBHOOK_SECRET is set). `
    } else if (reachable) {
      diagnosis += 'Webhook endpoint reachable on app.lurvox.in.'
    }

    return {
      configured_url_host: configuredHost,
      effective_url_host: new URL(effective).hostname,
      reachable,
      auth_rejects_unauthenticated: authRejectsUnauth,
      auth_rejects_bad_token: authRejectsBad,
      auth_accepts_good_token: authAcceptsGood,
      http_status_unauthenticated: noAuth.status,
      http_status_bad_token: bad.status,
      http_status_good_token: good.status,
      diagnosis: diagnosis.trim(),
    }
  } catch (err) {
    return {
      configured_url_host: configuredHost,
      effective_url_host: new URL(effective).hostname,
      reachable: false,
      auth_rejects_unauthenticated: null,
      auth_rejects_bad_token: null,
      auth_accepts_good_token: null,
      http_status_unauthenticated: null,
      http_status_bad_token: null,
      http_status_good_token: null,
      diagnosis: err instanceof Error ? err.message : String(err),
    }
  }
}
