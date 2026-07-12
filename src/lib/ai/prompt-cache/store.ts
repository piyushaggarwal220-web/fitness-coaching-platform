import type { CacheBlockId, CacheEntry } from './types'

/** Storage abstraction — application code must depend on this interface only. */
export interface PromptCacheStore {
  get<T>(key: string): Promise<CacheEntry<T> | null>
  set<T>(key: string, entry: CacheEntry<T>): Promise<void>
  delete(key: string): Promise<void>
  deleteByPrefix(prefix: string): Promise<number>
  clear(): Promise<void>
}

export function buildCacheKey(blockId: CacheBlockId, scope: string, version: string): string {
  return `${blockId}:${scope}:${version}`
}

export function buildScopeKey(scope: string, blockId: CacheBlockId): string {
  return `${blockId}:${scope}`
}
