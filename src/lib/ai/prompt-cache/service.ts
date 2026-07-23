import type { PromptBuilderInput, PromptBuilderResult } from '@/lib/ai/prompt-builder'
import {
  buildPrompt,
  filterKnowledgeEntries,
  selectKnowledgeCategories,
} from '@/lib/ai/prompt-builder'
import type { AiKnowledge } from '@/types/database'
import { defaultAssemblyOrder } from './assembly'
import {
  assemblePromptFromSections,
  buildBlockContent,
  buildCompileReport,
  buildFreshSections,
  hashCompiledPrompt,
} from './compiler'
import { recordCompileEvent } from './analytics'
import { getPromptCacheStore } from './memory-store'
import { registerCachedKey, invalidateForEvent, invalidatePromptCacheAll as clearAllCache } from './invalidation'
import { buildCacheKey } from './store'
import type {
  BlockCacheReport,
  CacheBlockId,
  CacheEntry,
  CacheTier,
  CompileCacheReport,
  InvalidationEvent,
  PromptLibraryCacheContent,
} from './types'
import { BLOCK_SECTION_MAP, BLOCK_TTL, CACHE_TTL_MS } from './types'
import {
  checkinVersion,
  clientProfileVersion,
  coachNotesVersion,
  complexityVersion,
  compiledPromptVersion,
  hardConstraintsVersion,
  knowledgeBaseVersion,
  onboardingVersion,
  planSectionVersion,
  promptLibraryVersion,
  trainingPreferencesVersion,
} from './versions'

export type PromptCacheInput = PromptBuilderInput & {
  clientId: string
  promptVersion?: string
  retry?: boolean
}

export type CompileResult = {
  result: PromptBuilderResult
  report: CompileCacheReport
}

let lastCompileReport: CompileCacheReport | null = null

export function getLastCompileReport(): CompileCacheReport | null {
  return lastCompileReport
}

function ttlFor(tier: CacheTier): number {
  return CACHE_TTL_MS[tier]
}

function byteSize(content: string): number {
  return Buffer.byteLength(content, 'utf8')
}

async function getBlock<T>(
  blockId: CacheBlockId,
  scope: string,
  version: string
): Promise<CacheEntry<T> | null> {
  try {
    const key = buildCacheKey(blockId, scope, version)
    return await getPromptCacheStore().get<T>(key)
  } catch {
    return null
  }
}

async function setBlock<T>(
  blockId: CacheBlockId,
  scope: string,
  version: string,
  content: T
): Promise<void> {
  try {
    const key = buildCacheKey(blockId, scope, version)
    const now = Date.now()
    const tier = BLOCK_TTL[blockId]
    const entry: CacheEntry<T> = {
      key,
      version,
      content,
      cachedAt: now,
      expiresAt: now + ttlFor(tier),
      byteSize:
        typeof content === 'string'
          ? byteSize(content)
          : byteSize(JSON.stringify(content)),
    }
    await getPromptCacheStore().set(key, entry)
    registerCachedKey(scope, blockId, key)
  } catch {
    // Cache write failure must not break generation.
  }
}

type BlockSpec = {
  blockId: CacheBlockId
  scope: string
  version: string
  build: () => string
}

async function resolveBlock(spec: BlockSpec): Promise<{ content: string; report: BlockCacheReport }> {
  const start = Date.now()
  const cached = await getBlock<string>(spec.blockId, spec.scope, spec.version)

  if (cached) {
    return {
      content: cached.content,
      report: {
        blockId: spec.blockId,
        version: spec.version,
        hit: true,
        compileTimeMs: Date.now() - start,
        byteSize: cached.byteSize,
      },
    }
  }

  const content = spec.build()
  await setBlock(spec.blockId, spec.scope, spec.version, content)

  return {
    content,
    report: {
      blockId: spec.blockId,
      version: spec.version,
      hit: false,
      compileTimeMs: Date.now() - start,
      byteSize: byteSize(content),
    },
  }
}

function knowledgeScope(categories: string[]): string {
  return categories.sort().join('+') || 'default'
}

function buildBlockSpecs(
  input: PromptCacheInput,
  knowledgeEntries: AiKnowledge[],
  categories: string[],
  selectedEntries: AiKnowledge[]
): BlockSpec[] {
  const ctx = { ...input, knowledgeEntries }
  const clientId = input.clientId
  const kbVer = knowledgeBaseVersion(knowledgeEntries)
  const catScope = knowledgeScope(categories)

  const specs: BlockSpec[] = [
    {
      blockId: 'knowledge-base',
      scope: catScope,
      version: kbVer,
      build: () => buildBlockContent('knowledge-base', { ...ctx, knowledgeEntries: selectedEntries }),
    },
    {
      blockId: 'client-profile',
      scope: clientId,
      version: clientProfileVersion(input.profile),
      build: () => buildBlockContent('client-profile', ctx),
    },
    {
      blockId: 'onboarding',
      scope: clientId,
      version: onboardingVersion(input.profile),
      build: () => buildBlockContent('onboarding', ctx),
    },
    {
      blockId: 'hard-constraints',
      scope: clientId,
      version: hardConstraintsVersion(input.profile),
      build: () => buildBlockContent('hard-constraints', ctx),
    },
    {
      blockId: 'training-preferences',
      scope: clientId,
      version: trainingPreferencesVersion(input.profile),
      build: () => buildBlockContent('training-preferences', ctx),
    },
    {
      blockId: 'complexity',
      scope: clientId,
      version: complexityVersion(clientId, input.complexityScore, input.latestCheckin?.submitted_at),
      build: () => buildBlockContent('complexity', ctx),
    },
    {
      blockId: 'diet',
      scope: clientId,
      version: planSectionVersion(clientId, input.activePlan, 'nutrition_plan'),
      build: () => buildBlockContent('diet', ctx),
    },
    {
      blockId: 'workout',
      scope: clientId,
      version: planSectionVersion(clientId, input.activePlan, 'workout_plan'),
      build: () => buildBlockContent('workout', ctx),
    },
    {
      blockId: 'active-plan',
      scope: clientId,
      version: planSectionVersion(clientId, input.activePlan, 'full'),
      build: () => buildBlockContent('active-plan', ctx),
    },
    {
      blockId: 'updated-diet',
      scope: clientId,
      version: planSectionVersion(clientId, input.updatedDietPlan, 'nutrition_plan'),
      build: () => buildBlockContent('updated-diet', { ...ctx, updatedDietPlan: input.updatedDietPlan }),
    },
    {
      blockId: 'checkins',
      scope: clientId,
      version: checkinVersion(clientId, input.latestCheckin),
      build: () => buildBlockContent('checkins', ctx),
    },
    {
      blockId: 'coach-notes',
      scope: clientId,
      version: coachNotesVersion(clientId, input.coachInstructions),
      build: () => buildBlockContent('coach-notes', ctx),
    },
  ]

  if (input.actionTemplate?.trim()) {
    const plVersion = promptLibraryVersion(input.promptVersion ?? 'v1')
    specs.push({
      blockId: 'prompt-library',
      scope: input.actionId ?? 'default',
      version: plVersion,
      build: () =>
        JSON.stringify({
          actionTemplate: input.actionTemplate!.trim(),
          systemTemplate: input.systemTemplate?.trim() ?? null,
          promptVersion: plVersion,
          actionId: input.actionId ?? 'default',
        } satisfies PromptLibraryCacheContent),
    })
  }

  return specs
}

function sectionsFromBlocks(
  blocks: Map<CacheBlockId, string>,
  fresh: ReturnType<typeof buildFreshSections>
): ReturnType<typeof buildFreshSections> {
  const mapSection = (blockId: CacheBlockId, fallback: string): string => {
    const key = BLOCK_SECTION_MAP[blockId]
    if (!key) return fallback
    return blocks.get(blockId) ?? fresh[key]
  }

  return {
    clientDetails: mapSection('client-profile', fresh.clientDetails),
    onboarding: mapSection('onboarding', fresh.onboarding),
    hardConstraints: mapSection('hard-constraints', fresh.hardConstraints),
    trainingPreferences: mapSection('training-preferences', fresh.trainingPreferences),
    activePlan: mapSection('active-plan', fresh.activePlan),
    activeDiet: mapSection('diet', fresh.activeDiet),
    activeWorkout: mapSection('workout', fresh.activeWorkout),
    updatedDiet: mapSection('updated-diet', fresh.updatedDiet),
    checkin: mapSection('checkins', fresh.checkin),
    coachNotes: mapSection('coach-notes', fresh.coachNotes),
    knowledge: mapSection('knowledge-base', fresh.knowledge),
    complexity: mapSection('complexity', fresh.complexity),
    mesocycle: fresh.mesocycle,
  }
}

/**
 * Compile prompts with dependency-based block caching.
 * Falls back to buildPrompt() on any cache failure — never breaks AI generation.
 */
export async function compileCachedPrompt(input: PromptCacheInput): Promise<CompileResult> {
  const compileStart = Date.now()

  try {
    const categories = selectKnowledgeCategories(input.profile)
    const selectedEntries = filterKnowledgeEntries(input.knowledgeEntries, categories)

    // Non-library prompts: cache compiled output only (buildPrompt does not use section blocks).
    if (!input.actionTemplate?.trim()) {
      const blockVersions: Record<string, string> = {
        'client-profile': clientProfileVersion(input.profile),
        complexity: complexityVersion(
          input.clientId,
          input.complexityScore,
          input.latestCheckin?.submitted_at
        ),
        checkins: checkinVersion(input.clientId, input.latestCheckin),
        'knowledge-base': knowledgeBaseVersion(input.knowledgeEntries),
      }
      const compiledVer = compiledPromptVersion({
        clientId: input.clientId,
        actionId: input.actionId,
        promptLibraryVersion: null,
        blockVersions,
        retry: input.retry,
      })

      const cachedCompiled = await getBlock<{
        systemPrompt: string
        userPrompt: string
        estimatedTokens: number
        selectedKnowledge: string[]
      }>('compiled-prompt', input.clientId, compiledVer)

      if (cachedCompiled) {
        const result: PromptBuilderResult = {
          systemPrompt: cachedCompiled.content.systemPrompt,
          userPrompt: cachedCompiled.content.userPrompt,
          estimatedTokens: cachedCompiled.content.estimatedTokens,
          selectedKnowledge: cachedCompiled.content.selectedKnowledge,
        }
        const report = buildCompileReport(
          [
            {
              blockId: 'compiled-prompt',
              version: compiledVer,
              hit: true,
              compileTimeMs: Date.now() - compileStart,
              byteSize: cachedCompiled.byteSize,
            },
          ],
          defaultAssemblyOrder(input.actionId),
          Date.now() - compileStart,
          result.estimatedTokens,
          hashCompiledPrompt(result.systemPrompt, result.userPrompt),
          null
        )
        recordCompileEvent({
          hits: 1,
          misses: 0,
          compileTimeMs: report.totalCompileTimeMs,
          promptTokens: result.estimatedTokens,
          tokensSaved: result.estimatedTokens,
        })
        lastCompileReport = report
        return { result, report }
      }

      const result = buildPrompt(input)
      await setBlock('compiled-prompt', input.clientId, compiledVer, {
        systemPrompt: result.systemPrompt,
        userPrompt: result.userPrompt,
        estimatedTokens: result.estimatedTokens,
        selectedKnowledge: result.selectedKnowledge,
      })
      const report = buildCompileReport(
        [
          {
            blockId: 'compiled-prompt',
            version: compiledVer,
            hit: false,
            compileTimeMs: Date.now() - compileStart,
            byteSize: byteSize(result.systemPrompt + result.userPrompt),
          },
        ],
        defaultAssemblyOrder(input.actionId),
        Date.now() - compileStart,
        result.estimatedTokens,
        hashCompiledPrompt(result.systemPrompt, result.userPrompt),
        null
      )
      recordCompileEvent({
        hits: 0,
        misses: 1,
        compileTimeMs: report.totalCompileTimeMs,
        promptTokens: result.estimatedTokens,
        tokensSaved: 0,
      })
      lastCompileReport = report
      return { result, report }
    }

    const specs = buildBlockSpecs(input, input.knowledgeEntries, categories, selectedEntries)

    const blockReports: BlockCacheReport[] = []
    const blockContents = new Map<CacheBlockId, string>()

    for (const spec of specs) {
      const { content, report } = await resolveBlock(spec)
      blockReports.push(report)
      blockContents.set(spec.blockId, content)
    }

    const fresh = buildFreshSections({ ...input, knowledgeEntries: selectedEntries })
    const sections = sectionsFromBlocks(blockContents, fresh)

    const result = assemblePromptFromSections(input, sections, selectedEntries)

    const blockVersions: Record<string, string> = {}
    for (const spec of specs) {
      blockVersions[spec.blockId] = spec.version
    }

    const compiledVer = compiledPromptVersion({
      clientId: input.clientId,
      actionId: input.actionId,
      promptLibraryVersion: input.promptVersion ?? null,
      blockVersions,
      retry: input.retry,
    })

    const compiledHash = hashCompiledPrompt(result.systemPrompt, result.userPrompt)
    const assemblyOrder = defaultAssemblyOrder(input.actionId)

    const report = buildCompileReport(
      blockReports,
      assemblyOrder,
      Date.now() - compileStart,
      result.estimatedTokens,
      compiledHash,
      input.promptVersion ?? null
    )

    await setBlock('compiled-prompt', input.clientId, compiledVer, {
      systemPrompt: result.systemPrompt,
      userPrompt: result.userPrompt,
      estimatedTokens: result.estimatedTokens,
      selectedKnowledge: result.selectedKnowledge,
    })

    const tokensSaved = blockReports
      .filter((b) => b.hit)
      .reduce((sum, b) => sum + Math.ceil(b.byteSize / 4), 0)

    recordCompileEvent({
      hits: report.cacheHits,
      misses: report.cacheMisses,
      compileTimeMs: report.totalCompileTimeMs,
      promptTokens: result.estimatedTokens,
      tokensSaved,
    })

    lastCompileReport = report
    return { result, report }
  } catch (err) {
    console.error('[prompt-cache] compile failed, falling back to buildPrompt:', err)
    const result = buildPrompt(input)
    const report = buildCompileReport(
      [],
      defaultAssemblyOrder(input.actionId),
      Date.now() - compileStart,
      result.estimatedTokens,
      hashCompiledPrompt(result.systemPrompt, result.userPrompt),
      input.promptVersion ?? null
    )
    lastCompileReport = report
    return { result, report }
  }
}

export function buildPromptWithCache(
  input: PromptCacheInput,
  actionId?: PromptCacheInput['actionId']
): Promise<CompileResult> {
  return compileCachedPrompt({ ...input, actionId: actionId ?? input.actionId })
}

/** @deprecated Use compileCachedPrompt — kept for import compatibility. */
export async function getCachedPrompt(input: PromptCacheInput): Promise<PromptBuilderResult> {
  const { result } = await compileCachedPrompt(input)
  return result
}

export function invalidatePromptCacheForClient(clientId: string): void {
  void invalidateForEvent('client_full_invalidate', clientId)
}

export function invalidatePromptCacheAll(): void {
  void clearAllCache()
}

export { invalidateForEvent, invalidateKnowledgeBase, invalidatePromptLibrary } from './invalidation'

export type { InvalidationEvent, CompileCacheReport, CacheAnalyticsSnapshot } from './types'
export { getPromptCacheAnalytics, resetPromptCacheAnalytics } from './analytics'
