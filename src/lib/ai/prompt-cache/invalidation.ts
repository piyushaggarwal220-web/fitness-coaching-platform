import type { CacheBlockId, InvalidationEvent } from './types'
import { INVALIDATION_RULES } from './types'
import { getPromptCacheStore } from './memory-store'
import { buildScopeKey } from './store'

/** Tracks active version pointers per scope+block for prefix invalidation. */
const versionIndex = new Map<string, Set<string>>()

function trackKey(scope: string, blockId: CacheBlockId, fullKey: string): void {
  const scopeKey = buildScopeKey(scope, blockId)
  const keys = versionIndex.get(scopeKey) ?? new Set()
  keys.add(fullKey)
  versionIndex.set(scopeKey, keys)
}

export function registerCachedKey(scope: string, blockId: CacheBlockId, fullKey: string): void {
  trackKey(scope, blockId, fullKey)
}

async function deleteAllBlockInstances(blockId: CacheBlockId): Promise<number> {
  const store = getPromptCacheStore()
  for (const key of [...versionIndex.keys()]) {
    if (key.startsWith(`${blockId}:`)) {
      versionIndex.delete(key)
    }
  }
  return store.deleteByPrefix(`${blockId}:`)
}

async function deleteScopeBlock(scope: string, blockId: CacheBlockId): Promise<number> {
  const store = getPromptCacheStore()
  const scopeKey = buildScopeKey(scope, blockId)
  const keys = versionIndex.get(scopeKey)
  let count = 0

  if (keys) {
    for (const key of keys) {
      await store.delete(key)
      count++
    }
    versionIndex.delete(scopeKey)
  }

  const prefix = `${blockId}:${scope}:`
  count += await store.deleteByPrefix(prefix)
  return count
}

export async function invalidateBlocks(
  scope: string,
  blockIds: CacheBlockId[]
): Promise<number> {
  let total = 0
  for (const blockId of blockIds) {
    total += await deleteScopeBlock(scope, blockId)
  }
  return total
}

export async function invalidateForEvent(
  event: InvalidationEvent,
  clientId?: string
): Promise<number> {
  const blocks = INVALIDATION_RULES[event]
  let total = 0

  const globalBlocks = blocks.filter(
    (b) => b === 'knowledge-base' || b === 'prompt-library'
  )
  const clientBlocks = blocks.filter(
    (b) => b !== 'knowledge-base' && b !== 'prompt-library'
  )

  for (const blockId of globalBlocks) {
    total += await deleteAllBlockInstances(blockId)
  }

  if (clientId) {
    for (const blockId of clientBlocks) {
      total += await deleteScopeBlock(clientId, blockId)
    }
  }

  return total
}

/** Backward-compatible full client invalidation. */
export async function invalidatePromptCacheForClient(clientId: string): Promise<void> {
  await invalidateForEvent('client_full_invalidate', clientId)
}

export async function invalidatePromptCacheAll(): Promise<void> {
  const store = getPromptCacheStore()
  await store.clear()
  versionIndex.clear()
}

export async function invalidateKnowledgeBase(): Promise<void> {
  await invalidateForEvent('knowledge_updated')
}

export async function invalidatePromptLibrary(): Promise<void> {
  await invalidateForEvent('prompt_library_updated')
}
