import type { CacheAnalyticsSnapshot } from './types'

type CompileEvent = {
  hits: number
  misses: number
  compileTimeMs: number
  promptTokens: number
  tokensSaved: number
  at: number
}

const MAX_EVENTS = 500
const events: CompileEvent[] = []

let totalHits = 0
let totalMisses = 0
let totalCompileTimeMs = 0
let totalCompiles = 0
let totalPromptTokens = 0
let totalTokensSaved = 0

/** Claude Sonnet input pricing — used for savings estimate only. */
const USD_PER_MILLION_INPUT = 3.0

export function recordCacheHit(blockCount = 1): void {
  totalHits += blockCount
}

export function recordCacheMiss(blockCount = 1): void {
  totalMisses += blockCount
}

export function recordCompileEvent(event: Omit<CompileEvent, 'at'>): void {
  totalHits += event.hits
  totalMisses += event.misses
  totalCompileTimeMs += event.compileTimeMs
  totalPromptTokens += event.promptTokens
  totalTokensSaved += event.tokensSaved
  totalCompiles += 1

  events.push({ ...event, at: Date.now() })
  if (events.length > MAX_EVENTS) {
    events.shift()
  }
}

export function getPromptCacheAnalytics(): CacheAnalyticsSnapshot {
  const attempts = totalHits + totalMisses
  const hitRatio = attempts > 0 ? Math.round((totalHits / attempts) * 1000) / 10 : 0
  const averageCompileTimeMs =
    totalCompiles > 0 ? Math.round(totalCompileTimeMs / totalCompiles) : 0
  const averagePromptTokens =
    totalCompiles > 0 ? Math.round(totalPromptTokens / totalCompiles) : 0
  const estimatedCostSavedUsd =
    Math.round(((totalTokensSaved / 1_000_000) * USD_PER_MILLION_INPUT) * 10000) / 10000

  return {
    totalHits,
    totalMisses,
    hitRatio,
    averageCompileTimeMs,
    averagePromptTokens,
    estimatedTokensSaved: totalTokensSaved,
    estimatedCostSavedUsd,
    recentCompiles: totalCompiles,
    lastUpdated: new Date().toISOString(),
  }
}

export function resetPromptCacheAnalytics(): void {
  totalHits = 0
  totalMisses = 0
  totalCompileTimeMs = 0
  totalCompiles = 0
  totalPromptTokens = 0
  totalTokensSaved = 0
  events.length = 0
}

export function getRecentCompileEvents(limit = 20): CompileEvent[] {
  return events.slice(-limit)
}
