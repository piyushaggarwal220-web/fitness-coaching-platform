import type { CacheEntry, CacheBlockId } from './types'
import type { PromptCacheStore } from './store'

/** In-memory store for development. Swap for Redis adapter in production. */
export class MemoryPromptCacheStore implements PromptCacheStore {
  private readonly map = new Map<string, CacheEntry<unknown>>()

  async get<T>(key: string): Promise<CacheEntry<T> | null> {
    const entry = this.map.get(key)
    if (!entry) return null
    if (Date.now() > entry.expiresAt) {
      this.map.delete(key)
      return null
    }
    return entry as CacheEntry<T>
  }

  async set<T>(key: string, entry: CacheEntry<T>): Promise<void> {
    this.map.set(key, entry as CacheEntry<unknown>)
  }

  async delete(key: string): Promise<void> {
    this.map.delete(key)
  }

  async deleteByPrefix(prefix: string): Promise<number> {
    let count = 0
    for (const key of [...this.map.keys()]) {
      if (key.startsWith(prefix)) {
        this.map.delete(key)
        count++
      }
    }
    return count
  }

  async clear(): Promise<void> {
    this.map.clear()
  }

  countByBlock(blockId: CacheBlockId): number {
    const prefix = `${blockId}:`
    return [...this.map.keys()].filter((k) => k.startsWith(prefix)).length
  }
}

let defaultStore: PromptCacheStore | null = null

export function getPromptCacheStore(): PromptCacheStore {
  if (!defaultStore) {
    defaultStore = new MemoryPromptCacheStore()
  }
  return defaultStore
}

export function setPromptCacheStore(store: PromptCacheStore): void {
  defaultStore = store
}

export function resetPromptCacheStore(): void {
  defaultStore = new MemoryPromptCacheStore()
}
