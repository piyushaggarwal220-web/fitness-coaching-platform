/**
 * Brave Search client for Jarvis research (web/search only — not Brave Answers).
 * Reads BRAVE_SEARCH_API_KEY server-side only. Never log or return the key.
 * Does not fetch full page HTML — titles/descriptions/snippets only (cost-bounded).
 */

import { redactSecrets } from '@/lib/jarvis/operator-errors'

export type BraveSearchResult = {
  title: string
  url: string
  domain: string
  description: string
  retrieved_at: string
}

export type BraveSearchErrorCode =
  | 'not_configured'
  | 'unauthorized'
  | 'forbidden'
  | 'rate_limited'
  | 'timeout'
  | 'provider_error'
  | 'empty'
  | 'network'

export type BraveSearchResponse = {
  ok: boolean
  configured: boolean
  results: BraveSearchResult[]
  error?: string
  error_code?: BraveSearchErrorCode
  costUsd: number
  /** ISO time when the provider response was received */
  retrieved_at?: string
  /** HTTP status from Brave, when a response was received */
  http_status?: number | null
  /** Wall-clock latency for the provider request (ms) */
  latency_ms?: number
  /** True when JSON body parsed and web.results shape was readable */
  parsed_ok?: boolean
}

const SEARCH_COST_USD = Number(process.env.JARVIS_BRAVE_SEARCH_COST_USD) || 0.02
/** Hard bound per Brave request (ms). */
const DEFAULT_TIMEOUT_MS = Math.min(
  Math.max(Number(process.env.JARVIS_BRAVE_SEARCH_TIMEOUT_MS) || 12_000, 3_000),
  30_000
)

function domainFromUrl(raw: string): string {
  try {
    return new URL(raw).hostname.replace(/^www\./, '')
  } catch {
    return ''
  }
}

/** Strip the live key and common secret shapes from any provider/error text. */
function safeErrorText(text: string, key?: string): string {
  let out = String(text || '').slice(0, 240)
  if (key && key.length > 4) {
    out = out.split(key).join('[redacted]')
  }
  out = out.replace(/X-Subscription-Token[=:\s]+\S+/gi, 'X-Subscription-Token=[redacted]')
  return redactSecrets(out)
}

function statusToErrorCode(status: number): BraveSearchErrorCode {
  if (status === 401) return 'unauthorized'
  if (status === 403) return 'forbidden'
  if (status === 429) return 'rate_limited'
  return 'provider_error'
}

function statusToMessage(status: number): string {
  if (status === 401) return 'Brave search unauthorized (invalid or missing BRAVE_SEARCH_API_KEY)'
  if (status === 403) return 'Brave search forbidden (subscription or permission denied)'
  if (status === 429) return 'Brave search rate limited'
  return `Brave search failed (HTTP ${status})`
}

export function isBraveSearchConfigured(): boolean {
  return Boolean(
    process.env.BRAVE_SEARCH_API_KEY?.trim() &&
      (process.env.JARVIS_WEB_SEARCH_PROVIDER?.trim() || 'brave') === 'brave'
  )
}

/**
 * Bounded Brave Web Search (GET /res/v1/web/search).
 * Does not call Brave Answers or summarizer endpoints.
 */
export async function braveWebSearch(
  query: string,
  opts?: { count?: number; timeoutMs?: number }
): Promise<BraveSearchResponse> {
  const key = process.env.BRAVE_SEARCH_API_KEY?.trim()
  if (!key) {
    return {
      ok: false,
      configured: false,
      results: [],
      error: 'BRAVE_SEARCH_API_KEY is not configured',
      error_code: 'not_configured',
      costUsd: 0,
      http_status: null,
      latency_ms: 0,
      parsed_ok: false,
    }
  }

  const q = String(query || '').trim().slice(0, 400)
  if (!q) {
    return {
      ok: false,
      configured: true,
      results: [],
      error: 'Search query is empty',
      error_code: 'provider_error',
      costUsd: 0,
      http_status: null,
      latency_ms: 0,
      parsed_ok: false,
    }
  }

  const count = Math.min(Math.max(opts?.count ?? 5, 1), 10)
  const timeoutMs = Math.min(
    Math.max(opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS, 3_000),
    30_000
  )
  const url = new URL('https://api.search.brave.com/res/v1/web/search')
  url.searchParams.set('q', q)
  url.searchParams.set('count', String(count))

  const retrieved_at = new Date().toISOString()
  const started = Date.now()

  try {
    const res = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'Accept-Encoding': 'gzip',
        'X-Subscription-Token': key,
      },
      signal: AbortSignal.timeout(timeoutMs),
    })
    const latency_ms = Date.now() - started

    if (!res.ok) {
      const body = await res.text().catch(() => '')
      const code = statusToErrorCode(res.status)
      const detail = safeErrorText(body, key)
      return {
        ok: false,
        configured: true,
        results: [],
        error: detail ? `${statusToMessage(res.status)}: ${detail}` : statusToMessage(res.status),
        error_code: code,
        costUsd: SEARCH_COST_USD,
        retrieved_at,
        http_status: res.status,
        latency_ms,
        parsed_ok: false,
      }
    }

    let parsed_ok = false
    let json: {
      web?: {
        results?: {
          title?: string
          description?: string
          url?: string
          extra_snippets?: string[]
        }[]
      }
    }
    try {
      json = (await res.json()) as typeof json
      parsed_ok = Array.isArray(json?.web?.results) || json?.web !== undefined || typeof json === 'object'
    } catch {
      return {
        ok: false,
        configured: true,
        results: [],
        error: 'Brave search response JSON could not be parsed',
        error_code: 'provider_error',
        costUsd: SEARCH_COST_USD,
        retrieved_at,
        http_status: res.status,
        latency_ms,
        parsed_ok: false,
      }
    }

    const results = (json.web?.results ?? [])
      .slice(0, count)
      .map((r) => {
        const resultUrl = r.url || ''
        const snippet =
          (r.description || '').trim() ||
          (Array.isArray(r.extra_snippets) ? r.extra_snippets.join(' ') : '').trim()
        return {
          title: r.title || 'Untitled',
          url: resultUrl,
          domain: domainFromUrl(resultUrl),
          description: snippet.slice(0, 500),
          retrieved_at,
        }
      })
      .filter((r) => r.url)

    if (results.length === 0) {
      return {
        ok: true,
        configured: true,
        results: [],
        error: 'Brave returned no web results',
        error_code: 'empty',
        costUsd: SEARCH_COST_USD,
        retrieved_at,
        http_status: res.status,
        latency_ms,
        parsed_ok,
      }
    }

    return {
      ok: true,
      configured: true,
      results,
      costUsd: SEARCH_COST_USD,
      retrieved_at,
      http_status: res.status,
      latency_ms,
      parsed_ok,
    }
  } catch (err) {
    const latency_ms = Date.now() - started
    const raw = err instanceof Error ? err.message : 'Brave search error'
    const isTimeout =
      (err instanceof Error && err.name === 'TimeoutError') ||
      /timeout|aborted|AbortError/i.test(raw)
    return {
      ok: false,
      configured: true,
      results: [],
      error: safeErrorText(isTimeout ? 'Brave search request timed out' : raw, key),
      error_code: isTimeout ? 'timeout' : 'network',
      costUsd: 0,
      retrieved_at,
      http_status: null,
      latency_ms,
      parsed_ok: false,
    }
  }
}
