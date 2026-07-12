import type { PromptBuilderInput, PromptBuilderResult, PromptContextSections } from '@/lib/ai/prompt-builder'
import {
  buildPrompt,
  buildPromptContextSections,
  estimateTokens,
  filterKnowledgeEntries,
  injectPromptPlaceholders,
  selectKnowledgeCategories,
} from '@/lib/ai/prompt-builder'
import type { AiKnowledge } from '@/types/database'
import type { CacheBlockId, BlockCacheReport, CompileCacheReport } from './types'
import { BLOCK_SECTION_MAP } from './types'
import { resolveAppendOrderForAction } from './assembly'
import { hashContent } from './versions'

function buildSystemPromptFromSections(
  input: PromptBuilderInput,
  sections: PromptContextSections,
  selectedEntries: AiKnowledge[]
): string {
  if (input.systemTemplate?.trim()) {
    return injectPromptPlaceholders(input.systemTemplate.trim(), sections)
  }

  // Mirror buildSystemPrompt() using prebuilt knowledge section — identical prose.
  const complexity = input.complexityScore
  const parts = [
    [
      '# Role',
      'You are an expert fitness coaching assistant for an online coaching platform.',
      'Provide evidence-based, practical guidance aligned with the coaching knowledge base.',
      'Prioritize client safety, sustainability, and adherence.',
    ].join('\n'),
    [
      '# Complexity Context',
      `This client is classified as ${complexity.tier} complexity (score: ${complexity.score}).`,
      complexity.tier === 'HIGH'
        ? 'Apply extra caution with medical considerations, progressive adjustments, and clear rationale.'
        : complexity.tier === 'MEDIUM'
          ? 'Balance personalization with clear, actionable recommendations.'
          : 'Keep recommendations straightforward and easy to follow.',
    ].join('\n'),
    [
      '# Response Guidelines',
      '- Use the coaching knowledge base as your primary reference.',
      '- Tailor advice to the client profile and latest check-in data.',
      '- Be specific and actionable; avoid generic filler.',
      '- Flag when professional medical clearance may be needed.',
      '- Do not invent facts not supported by the provided context.',
    ].join('\n'),
    sections.knowledge,
  ]
  void selectedEntries
  return parts.join('\n\n')
}

function hasSubstantiveContext(section: string): boolean {
  const trimmed = section.trim()
  if (!trimmed) return false
  const emptyMarkers = [
    '## Latest Check-In\nNo check-in provided',
    '## Onboarding Answers\nNo extended onboarding data',
    '## Coach Notes\nNone provided.',
    '## Current Active Plan\nNo active plan on file.',
    '## Current Active Diet\nNo active diet on file.',
    '## Current Active Workout\nNo active workout on file.',
    '## Newly Generated Updated Diet\nNo updated diet is available.',
  ]
  return !emptyMarkers.some((marker) => trimmed.startsWith(marker))
}

function sectionWasInjected(prompt: string, section: string): boolean {
  if (!section.trim()) return true
  const marker = section.trim().slice(0, 48)
  return marker.length > 0 && prompt.includes(marker)
}

function appendMissingLibraryContext(
  userPrompt: string,
  systemPrompt: string,
  sections: PromptContextSections,
  actionId?: PromptBuilderInput['actionId']
): string {
  const injectedCorpus = `${systemPrompt}\n${userPrompt}`
  const extras = resolveAppendOrderForAction(actionId)

  const blocks = extras
    .map((key: keyof PromptContextSections) => sections[key])
    .filter(
      (section: string) =>
        hasSubstantiveContext(section) && !sectionWasInjected(injectedCorpus, section)
    )

  if (blocks.length === 0) return userPrompt
  return [userPrompt, ...blocks].join('\n\n')
}

/**
 * Assemble prompts from prebuilt context sections using the same logic as buildPrompt().
 * Produces byte-identical output to buildPrompt() when sections match buildPromptContextSections().
 */
export function assemblePromptFromSections(
  input: PromptBuilderInput,
  sections: PromptContextSections,
  selectedEntries: AiKnowledge[]
): PromptBuilderResult {
  const categories = selectKnowledgeCategories(input.profile)

  if (input.actionTemplate?.trim()) {
    const systemPrompt = buildSystemPromptFromSections(input, sections, selectedEntries)
    const userPrompt = appendMissingLibraryContext(
      injectPromptPlaceholders(input.actionTemplate.trim(), sections),
      systemPrompt,
      sections,
      input.actionId
    )
    return {
      systemPrompt,
      userPrompt,
      selectedKnowledge: categories,
      estimatedTokens: estimateTokens(systemPrompt, userPrompt),
    }
  }

  // Non-library path must match buildPrompt exactly — delegate to preserve behaviour.
  return buildPrompt(input)
}

export function buildFreshSections(
  input: PromptBuilderInput & { knowledgeEntries: AiKnowledge[] }
): PromptContextSections {
  return buildPromptContextSections(input)
}

export function buildBlockContent(
  blockId: CacheBlockId,
  input: PromptBuilderInput & { knowledgeEntries: AiKnowledge[] }
): string {
  const sections = buildPromptContextSections(input)
  const sectionKey = BLOCK_SECTION_MAP[blockId]
  if (!sectionKey) {
    throw new Error(`Block ${blockId} has no section mapping`)
  }
  return sections[sectionKey]
}

export function buildCompileReport(
  blocks: BlockCacheReport[],
  assemblyOrder: string[],
  totalCompileTimeMs: number,
  estimatedTokens: number,
  compiledPromptHash: string,
  promptLibraryVersion: string | null
): CompileCacheReport {
  const hits = blocks.filter((b) => b.hit).length
  const misses = blocks.filter((b) => !b.hit).length
  const total = hits + misses
  return {
    blocks,
    assemblyOrder,
    totalCompileTimeMs,
    cacheHits: hits,
    cacheMisses: misses,
    hitRatio: total > 0 ? Math.round((hits / total) * 1000) / 10 : 0,
    estimatedTokens,
    compiledPromptHash,
    promptLibraryVersion,
  }
}

export function hashCompiledPrompt(systemPrompt: string, userPrompt: string): string {
  return hashContent(`${systemPrompt}\n---\n${userPrompt}`)
}
