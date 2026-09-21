/**
 * Bounded real Brave Search verification (exactly one request).
 * Usage: npx tsx --env-file=.env.local scripts/verify-brave-search.ts
 *
 * Never prints BRAVE_SEARCH_API_KEY, Authorization headers, or X-Subscription-Token values.
 */
import { createAdminClient } from '../src/lib/supabase/admin'
import {
  braveWebSearch,
  isBraveSearchConfigured,
} from '../src/lib/jarvis/research/brave-search'
import { sanitizePublicJson } from '../src/lib/jarvis/operator-errors'

const VERIFY_QUERY = 'OpenAI API documentation'
const VERIFY_COUNT = 3

function assertNoKeyLeak(payload: unknown, keyPresent: boolean) {
  const dumped = JSON.stringify(payload)
  if (keyPresent) {
    const key = process.env.BRAVE_SEARCH_API_KEY?.trim() || ''
    if (key.length > 8 && dumped.includes(key)) {
      throw new Error('FAIL: API key leaked into verification output')
    }
  }
  if (/X-Subscription-Token[=:\s]+(?!\[redacted\])\S+/i.test(dumped)) {
    throw new Error('FAIL: subscription token header leaked into output')
  }
  if (/Authorization[=:\s]+(?!\[redacted\])\S+/i.test(dumped)) {
    throw new Error('FAIL: Authorization header leaked into output')
  }
}

async function main() {
  const configured = isBraveSearchConfigured()
  const keyLen = process.env.BRAVE_SEARCH_API_KEY?.trim()?.length ?? 0
  const provider = process.env.JARVIS_WEB_SEARCH_PROVIDER?.trim() || 'brave'

  console.log(
    JSON.stringify({
      phase: 'config',
      env_var: 'BRAVE_SEARCH_API_KEY',
      configured,
      key_present: keyLen > 0,
      key_length: keyLen,
      provider,
      note: 'Key value is never printed.',
    })
  )

  if (!configured || keyLen === 0) {
    console.log(
      JSON.stringify({
        phase: 'search',
        ok: false,
        configuration_error: true,
        error: 'BRAVE_SEARCH_API_KEY is not configured in the server-side environment',
        error_code: 'not_configured',
        http_status: null,
        result_count: 0,
        latency_ms: 0,
        parsed_ok: false,
        retries: 0,
        persistence: 'skipped',
      })
    )
    process.exitCode = 2
    return
  }

  // Exactly one bounded search — no retries.
  const search = await braveWebSearch(VERIFY_QUERY, {
    count: VERIFY_COUNT,
    timeoutMs: 12_000,
  })

  const publicSearch = sanitizePublicJson({
    ok: search.ok,
    configuration_error: false,
    query: VERIFY_QUERY,
    http_status: search.http_status ?? null,
    provider_status: search.error_code ?? (search.ok ? 'ok' : 'error'),
    error_code: search.error_code ?? null,
    error: search.error ?? null,
    result_count: search.results.length,
    latency_ms: search.latency_ms ?? null,
    parsed_ok: search.parsed_ok === true,
    cost_usd: search.costUsd,
    retrieved_at: search.retrieved_at ?? null,
    retries: 0,
    results: search.results.map((r) => ({
      title: r.title,
      url: r.url,
      domain: r.domain,
      snippet_chars: r.description.length,
      retrieved_at: r.retrieved_at,
    })),
  })

  assertNoKeyLeak(publicSearch, true)
  console.log(JSON.stringify({ phase: 'search', ...(publicSearch as object) }))

  if (!search.ok) {
    console.log(
      JSON.stringify({
        phase: 'persistence',
        ok: false,
        reason: search.error_code || search.error || 'search_failed',
      })
    )
    process.exitCode = 1
    return
  }

  if (search.results.length === 0) {
    console.log(
      JSON.stringify({
        phase: 'persistence',
        ok: false,
        reason: 'empty',
      })
    )
    process.exitCode = 3
    return
  }

  const admin = createAdminClient()
  const sources = search.results.map((r) => ({
    title: r.title,
    url: r.url,
    domain: r.domain,
    note: r.description,
    retrieved_at: r.retrieved_at,
  }))

  const { data: row, error: insertError } = await admin
    .from('jarvis_research')
    .insert({
      objective: 'verify_brave_search',
      decision_context: 'Bounded Brave Search API verification script',
      question: `verify:brave ${VERIFY_QUERY}`,
      status: 'completed',
      sources,
      queries: [VERIFY_QUERY],
      key_findings: [
        `Brave web search returned ${search.results.length} result(s)`,
        'Retrieval layer only — synthesis uses LURVOX AI when research.objective runs',
      ],
      conclusion:
        'Brave Search retrieval verified. Sources stored for operator inspection. No Brave Answers used.',
      confidence: 'high',
      decision_influenced: 'verification_only',
      budget_usd: 0.05,
      spent_usd: search.costUsd,
      max_searches: 1,
      searches_used: 1,
      max_tokens: 0,
      tokens_used: 0,
      max_sources: VERIFY_COUNT,
      max_runtime_minutes: 1,
      stop_reason: 'verify_brave_search',
      completed_at: new Date().toISOString(),
    })
    .select('id, status, searches_used, spent_usd')
    .maybeSingle()

  if (insertError || !row?.id) {
    const reason = insertError?.message
      ? String(insertError.message).slice(0, 160)
      : 'insert_failed'
    console.log(
      JSON.stringify(
        sanitizePublicJson({
          phase: 'persistence',
          ok: false,
          reason,
        })
      )
    )
    process.exitCode = 1
    return
  }

  const { data: readBack, error: readError } = await admin
    .from('jarvis_research')
    .select('id, status, sources, searches_used, spent_usd, stop_reason')
    .eq('id', row.id)
    .maybeSingle()

  const sourceCount = Array.isArray(readBack?.sources) ? readBack.sources.length : 0
  const persistencePayload = sanitizePublicJson({
    ok: !readError && sourceCount > 0,
    research_id: row.id,
    status: readBack?.status ?? null,
    sources_stored: sourceCount,
    searches_used: readBack?.searches_used ?? null,
    spent_usd: readBack?.spent_usd ?? null,
    stop_reason: readBack?.stop_reason ?? null,
  })
  assertNoKeyLeak(persistencePayload, true)
  console.log(JSON.stringify({ phase: 'persistence', ...(persistencePayload as object) }))

  if (!readBack || sourceCount === 0) {
    process.exitCode = 1
  }
}

main().catch((err) => {
  const msg = err instanceof Error ? err.message : 'verify-brave-search failed'
  console.log(
    JSON.stringify({
      phase: 'fatal',
      ok: false,
      error: String(msg).slice(0, 200),
    })
  )
  process.exitCode = 1
})
