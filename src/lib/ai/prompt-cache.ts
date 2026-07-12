/**
 * Backward-compatible barrel — re-exports the dependency-based prompt cache module.
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
} from './prompt-cache/index'

export type {
  PromptCacheInput,
  CompileResult,
  InvalidationEvent,
  CompileCacheReport,
  CacheAnalyticsSnapshot,
} from './prompt-cache/index'
