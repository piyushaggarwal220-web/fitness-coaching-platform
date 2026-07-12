/**
 * Dependency-based prompt cache — block types, TTLs, and versioning.
 */

import type { PromptContextSectionKey } from '@/lib/ai/prompt-builder'

export type CacheBlockId =
  | 'knowledge-base'
  | 'prompt-library'
  | 'client-profile'
  | 'onboarding'
  | 'hard-constraints'
  | 'training-preferences'
  | 'complexity'
  | 'diet'
  | 'workout'
  | 'active-plan'
  | 'updated-diet'
  | 'checkins'
  | 'coach-notes'
  | 'compiled-prompt'

export type CacheTier = 'long' | 'medium' | 'short'

export const CACHE_TTL_MS: Record<CacheTier, number> = {
  long: 24 * 60 * 60 * 1000,
  medium: 60 * 60 * 1000,
  short: 15 * 60 * 1000,
}

export const BLOCK_TTL: Record<CacheBlockId, CacheTier> = {
  'knowledge-base': 'long',
  'prompt-library': 'long',
  'client-profile': 'long',
  onboarding: 'long',
  'hard-constraints': 'long',
  'training-preferences': 'long',
  complexity: 'short',
  diet: 'medium',
  workout: 'medium',
  'active-plan': 'medium',
  'updated-diet': 'short',
  checkins: 'short',
  'coach-notes': 'short',
  'compiled-prompt': 'short',
}

/** Maps cache blocks to prompt-builder context section keys. */
export const BLOCK_SECTION_MAP: Partial<Record<CacheBlockId, PromptContextSectionKey>> = {
  'knowledge-base': 'knowledge',
  'client-profile': 'clientDetails',
  onboarding: 'onboarding',
  'hard-constraints': 'hardConstraints',
  'training-preferences': 'trainingPreferences',
  complexity: 'complexity',
  diet: 'activeDiet',
  workout: 'activeWorkout',
  'active-plan': 'activePlan',
  'updated-diet': 'updatedDiet',
  checkins: 'checkin',
  'coach-notes': 'coachNotes',
}

export type CacheEntry<T> = {
  key: string
  version: string
  content: T
  cachedAt: number
  expiresAt: number
  byteSize: number
}

export type BlockCacheReport = {
  blockId: CacheBlockId
  version: string
  hit: boolean
  compileTimeMs: number
  byteSize: number
}

export type CompileCacheReport = {
  blocks: BlockCacheReport[]
  assemblyOrder: string[]
  totalCompileTimeMs: number
  cacheHits: number
  cacheMisses: number
  hitRatio: number
  estimatedTokens: number
  compiledPromptHash: string
  promptLibraryVersion: string | null
}

export type InvalidationEvent =
  | 'onboarding_submitted'
  | 'profile_updated'
  | 'medical_updated'
  | 'journey_updated'
  | 'checkin_submitted'
  | 'plan_edited'
  | 'plan_activated'
  | 'knowledge_updated'
  | 'prompt_library_updated'
  | 'complexity_recalculated'
  | 'coach_notes_changed'
  | 'client_full_invalidate'

export const INVALIDATION_RULES: Record<InvalidationEvent, CacheBlockId[]> = {
  onboarding_submitted: [
    'client-profile',
    'onboarding',
    'hard-constraints',
    'training-preferences',
    'complexity',
    'compiled-prompt',
  ],
  profile_updated: ['client-profile', 'hard-constraints', 'training-preferences', 'compiled-prompt'],
  medical_updated: ['hard-constraints', 'client-profile', 'compiled-prompt'],
  journey_updated: ['compiled-prompt'],
  checkin_submitted: ['checkins', 'complexity', 'compiled-prompt'],
  plan_edited: ['diet', 'workout', 'active-plan', 'compiled-prompt'],
  plan_activated: ['diet', 'workout', 'active-plan', 'compiled-prompt'],
  knowledge_updated: ['knowledge-base', 'compiled-prompt'],
  prompt_library_updated: ['prompt-library', 'compiled-prompt'],
  complexity_recalculated: ['complexity', 'compiled-prompt'],
  coach_notes_changed: ['coach-notes', 'compiled-prompt'],
  client_full_invalidate: [
    'client-profile',
    'onboarding',
    'hard-constraints',
    'training-preferences',
    'complexity',
    'diet',
    'workout',
    'active-plan',
    'updated-diet',
    'checkins',
    'coach-notes',
    'compiled-prompt',
  ],
}

export type PromptLibraryCacheContent = {
  actionTemplate: string
  systemTemplate: string | null
  promptVersion: string
  actionId: import('@/lib/coach/ai-actions').CoachAiActionId | 'default'
}

export type CompiledPromptCacheContent = {
  systemPrompt: string
  userPrompt: string
  estimatedTokens: number
  selectedKnowledge: string[]
}

export type CacheAnalyticsSnapshot = {
  totalHits: number
  totalMisses: number
  hitRatio: number
  averageCompileTimeMs: number
  averagePromptTokens: number
  estimatedTokensSaved: number
  estimatedCostSavedUsd: number
  recentCompiles: number
  lastUpdated: string
}
