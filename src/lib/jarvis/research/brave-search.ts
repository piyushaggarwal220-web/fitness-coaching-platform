/**
 * Brave Search client for Jarvis research.
 * Never called without BRAVE_SEARCH_API_KEY.
 * Does not fetch full page HTML by default — titles/descriptions only (cost-bounded).
 */

export type BraveSearchResult = {
  title: string
  url: string
  description: string
}

export type BraveSearchResponse = {
  ok: boolean
  configured: boolean
  results: BraveSearchResult[]
  error?: string
  costUsd: number
}

const SEARCH_COST_USD = Number(process.env.JARVIS_BRAVE_SEARCH_COST_USD) || 0.02

export function isBraveSearchConfigured(): boolean {
  return Boolean(
    process.env.BRAVE_SEARCH_API_KEY?.trim() &&
      (process.env.JARVIS_WEB_SEARCH_PROVIDER?.trim() || 'brave') === 'brave'
  )
}

export async function braveWebSearch(
  query: string,
  opts?: { count?: number }
): Promise<BraveSearchResponse> {
  const key = process.env.BRAVE_SEARCH_API_KEY?.trim()
  if (!key) {
    return {
      ok: false,
      configured: false,
      results: [],
      error: 'BRAVE_SEARCH_API_KEY is not configured',
      costUsd: 0,
    }
  }

  const count = Math.min(Math.max(opts?.count ?? 5, 1), 10)
  const url = new URL('https://api.search.brave.com/res/v1/web/search')
  url.searchParams.set('q', query)
  url.searchParams.set('count', String(count))

  try {
    const res = await fetch(url.toString(), {
      headers: {
        Accept: 'application/json',
        'X-Subscription-Token': key,
      },
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      return {
        ok: false,
        configured: true,
        results: [],
        error: `Brave search failed (${res.status}): ${body.slice(0, 200)}`,
        costUsd: SEARCH_COST_USD,
      }
    }
    const json = (await res.json()) as {
      web?: { results?: { title?: string; description?: string; url?: string }[] }
    }
    const results = (json.web?.results ?? [])
      .slice(0, count)
      .map((r) => ({
        title: r.title || 'Untitled',
        url: r.url || '',
        description: (r.description || '').slice(0, 500),
      }))
      .filter((r) => r.url)

    return { ok: true, configured: true, results, costUsd: SEARCH_COST_USD }
  } catch (err) {
    return {
      ok: false,
      configured: true,
      results: [],
      error: err instanceof Error ? err.message : 'Brave search error',
      costUsd: 0,
    }
  }
}
