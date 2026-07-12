/**
 * Dependency-based prompt cache — public API.
 * Replaces the legacy monolithic src/lib/ai/prompt-cache.ts module.
 */
export {
  compileCachedPrompt,
  getCachedPrompt,
  buildPromptWithCache,
  getLastCompileReport,
  invalidatePromptCacheForClient,
  invalidatePromptCacheAll,
  invalidateForEvent,
  invalidateKnowledgeBase,
  invalidatePromptLibrary,
  getPromptCacheAnalytics,
  resetPromptCacheAnalytics,
} from './service'

export type {
  PromptCacheInput,
  CompileResult,
  InvalidationEvent,
  CompileCacheReport,
  CacheAnalyticsSnapshot,
} from './service'

export type { PromptCacheStore } from './store'
export { getPromptCacheStore, setPromptCacheStore, resetPromptCacheStore } from './memory-store'
