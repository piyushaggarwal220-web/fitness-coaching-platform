import type { PromptBuilderInput, PromptBuilderResult } from '@/lib/ai/prompt-builder'
import { buildPrompt } from '@/lib/ai/prompt-builder'
import type { CoachAiActionId } from '@/lib/coach/ai-actions'

type CacheEntry = {
  result: PromptBuilderResult
  key: string
  cachedAt: number
}

const CACHE_TTL_MS = 30 * 60 * 1000
const cache = new Map<string, CacheEntry>()

export type PromptCacheInput = PromptBuilderInput & {
  clientId: string
  promptVersion?: string
  knowledgeVersion?: string
  onboardingVersion?: string
  planVersion?: string | number
  checkinVersion?: string
}

function buildCacheKey(input: PromptCacheInput): string {
  return [
    input.clientId,
    input.actionId ?? 'default',
    input.promptVersion ?? 'v1',
    input.knowledgeVersion ?? 'kb',
    input.onboardingVersion ?? String(input.profile.updated_at ?? input.profile.id),
    input.planVersion ?? String(input.activePlan?.version ?? 'none'),
    input.checkinVersion ?? input.latestCheckin?.submitted_at ?? 'none',
    input.coachInstructions?.trim() ?? '',
  ].join('|')
}

export function invalidatePromptCacheForClient(clientId: string): void {
  for (const key of cache.keys()) {
    if (key.startsWith(`${clientId}|`)) cache.delete(key)
  }
}

export function invalidatePromptCacheAll(): void {
  cache.clear()
}

export function getCachedPrompt(input: PromptCacheInput): PromptBuilderResult {
  const key = buildCacheKey(input)
  const existing = cache.get(key)
  const now = Date.now()

  if (existing && now - existing.cachedAt < CACHE_TTL_MS) {
    return existing.result
  }

  const result = buildPrompt(input)
  cache.set(key, { result, key, cachedAt: now })
  return result
}

export function buildPromptWithCache(
  input: PromptCacheInput,
  actionId?: CoachAiActionId
): PromptBuilderResult {
  return getCachedPrompt({ ...input, actionId: actionId ?? input.actionId })
}
