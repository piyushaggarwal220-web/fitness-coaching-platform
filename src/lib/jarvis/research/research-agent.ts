import { createAdminClient } from '@/lib/supabase/admin'
import { generateMarketingJson } from '@/lib/ai-marketing/openai/marketing-openai'
import { getJarvisBudgets } from '@/lib/jarvis/cost/governor'
import { assertAiBudgetAvailable, recordCostUsage } from '@/lib/jarvis/cost/usage'
import { remember, searchMemory } from '@/lib/jarvis/memory/business-memory'
import { braveWebSearch, isBraveSearchConfigured } from '@/lib/jarvis/research/brave-search'
import { z } from 'zod'

const researchPlanSchema = z.object({
  should_research: z.boolean(),
  reason: z.string(),
  searches: z.array(z.string()).max(10),
  stop_when: z.string(),
  prior_is_sufficient: z.boolean().default(false),
})

const researchSynthSchema = z.object({
  key_findings: z.array(z.string()).min(1).max(10),
  conclusion: z.string().min(20),
  confidence: z.enum(['low', 'medium', 'high']),
  decision_influence: z.string(),
  sufficient: z.boolean(),
  conflicting_claims: z.array(z.string()).default([]),
})

export type ResearchJobInput = {
  objective: string
  decisionContext: string
  question: string
  maxCostUsd?: number
  maxTokens?: number
  maxSearches?: number
  maxSources?: number
  maxRuntimeMinutes?: number
  actorId?: string | null
  taskId?: string | null
  /** Force refresh even if recent memory exists */
  forceRefresh?: boolean
}

export type ResearchJobResult = {
  status:
    | 'completed'
    | 'stopped_sufficient'
    | 'stopped_budget'
    | 'stopped_search_limit'
    | 'stopped_runtime'
    | 'stopped_sources'
    | 'failed'
    | 'not_configured'
    | 'reused'
  conclusion?: string
  key_findings?: string[]
  confidence?: string
  sources?: {
    title: string
    url?: string
    domain?: string
    note: string
    retrieved_at?: string
  }[]
  queries?: string[]
  spent_usd: number
  tokens_used?: number
  searches_used?: number
  stop_reason?: string
  research_id?: string
  memory_id?: string
  error?: string
  note?: string
  decision_influence?: string
}

/** Map runtime statuses onto jarvis_research CHECK constraint values. */
function persistStatus(
  status: ResearchJobResult['status']
): 'planned' | 'running' | 'completed' | 'stopped_budget' | 'stopped_sufficient' | 'failed' | 'cancelled' {
  switch (status) {
    case 'completed':
      return 'completed'
    case 'stopped_sufficient':
    case 'reused':
      return 'stopped_sufficient'
    case 'stopped_budget':
    case 'stopped_search_limit':
    case 'stopped_runtime':
    case 'stopped_sources':
      return 'stopped_budget'
    case 'not_configured':
    case 'failed':
      return 'failed'
    default:
      return 'failed'
  }
}

function normalizeQuestion(q: string): string {
  return q.toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 200)
}

/**
 * Objective-driven web research with hard caps.
 * Uses Brave when configured. Never browses unboundedly.
 */
export async function runObjectiveResearch(input: ResearchJobInput): Promise<ResearchJobResult> {
  const budgets = await getJarvisBudgets()
  const maxBudget = Math.min(
    input.maxCostUsd ?? budgets.per_research_budget_usd,
    budgets.per_research_budget_usd
  )
  const maxSearches = Math.min(
    input.maxSearches ?? budgets.max_searches_per_research,
    budgets.max_searches_per_research
  )
  const maxSources = Math.min(input.maxSources ?? 8, 12)
  const maxTokens = Math.min(input.maxTokens ?? budgets.max_tokens_per_task, budgets.max_tokens_per_task)
  const maxRuntimeMs = Math.min(input.maxRuntimeMinutes ?? 15, 30) * 60_000
  const startedAt = Date.now()

  const gate = await assertAiBudgetAvailable(Math.min(0.05, maxBudget))
  if (!gate.ok) {
    return { status: 'stopped_budget', error: gate.reason, spent_usd: 0, stop_reason: 'daily_budget' }
  }

  const admin = createAdminClient()
  const qNorm = normalizeQuestion(input.question)

  // --- Research memory reuse ---
  if (!input.forceRefresh) {
    const priorMem = await searchMemory({
      query: input.question,
      category: 'research',
      limit: 8,
    })
    const fresh = priorMem.find((row) => {
      const ageMs = Date.now() - new Date(row.created_at).getTime()
      const titleHit =
        normalizeQuestion(row.title).includes(qNorm.slice(0, 40)) ||
        normalizeQuestion(row.summary).includes(qNorm.slice(0, 30))
      return ageMs < 1000 * 60 * 60 * 24 * 3 && titleHit
    })
    if (fresh) {
      return {
        status: 'reused',
        conclusion: fresh.summary,
        confidence: fresh.confidence,
        spent_usd: 0,
        memory_id: fresh.id,
        stop_reason: 'reused_recent_memory',
        note: 'Reused research memory from last 3 days — no new spend.',
      }
    }

    const { data: priorResearch } = await admin
      .from('jarvis_research')
      .select('id, question, conclusion, confidence, key_findings, spent_usd, completed_at, status')
      .in('status', ['completed', 'stopped_sufficient'])
      .order('created_at', { ascending: false })
      .limit(20)

    const match = (priorResearch ?? []).find((r) => {
      if (!r.completed_at) return false
      const age = Date.now() - new Date(r.completed_at).getTime()
      return (
        age < 1000 * 60 * 60 * 24 * 3 &&
        normalizeQuestion(String(r.question)) === qNorm
      )
    })
    if (match?.conclusion) {
      return {
        status: 'reused',
        conclusion: match.conclusion,
        key_findings: Array.isArray(match.key_findings)
          ? (match.key_findings as string[])
          : [],
        confidence: match.confidence ?? 'medium',
        spent_usd: 0,
        research_id: match.id,
        stop_reason: 'reused_recent_research',
        note: 'Identical research question answered recently — reused.',
      }
    }
  }

  const braveReady = isBraveSearchConfigured()

  const { data: row } = await admin
    .from('jarvis_research')
    .insert({
      objective: input.objective,
      decision_context: input.decisionContext,
      question: input.question,
      status: 'running',
      budget_usd: maxBudget,
      max_searches: maxSearches,
      max_tokens: maxTokens,
      max_sources: maxSources,
      max_runtime_minutes: Math.min(input.maxRuntimeMinutes ?? 15, 30),
      task_id: input.taskId ?? null,
    })
    .select('id')
    .maybeSingle()

  let spent = 0
  let tokens = 0
  let searchesUsed = 0
  const sources: {
    title: string
    url?: string
    domain?: string
    note: string
    retrieved_at?: string
  }[] = []
  const queries: string[] = []

  const runtimeExceeded = () => Date.now() - startedAt >= maxRuntimeMs
  const budgetExceeded = () => spent >= maxBudget
  const stop = async (
    status: ResearchJobResult['status'],
    extra: Partial<ResearchJobResult> = {}
  ): Promise<ResearchJobResult> => {
    const result: ResearchJobResult = {
      status,
      spent_usd: spent,
      tokens_used: tokens,
      searches_used: searchesUsed,
      sources,
      queries,
      research_id: row?.id,
      ...extra,
    }
    if (row?.id) {
      await admin
        .from('jarvis_research')
        .update({
          status: persistStatus(status),
          sources,
          queries,
          key_findings: extra.key_findings ?? [],
          conclusion: extra.conclusion ?? null,
          confidence: extra.confidence ?? null,
          decision_influenced: extra.decision_influence ?? null,
          searches_used: searchesUsed,
          spent_usd: spent,
          tokens_used: tokens,
          stop_reason: extra.stop_reason ?? status,
          memory_id: extra.memory_id ?? null,
          completed_at: new Date().toISOString(),
        })
        .eq('id', row.id)
    }
    return result
  }

  try {
    const plan = await generateMarketingJson({
      systemPrompt: `You are Jarvis research planner for LURVOX.
Plan MINIMUM searches for ONE business decision.
If prior memory answers it, set should_research=false.
Never plan open-ended browsing.
Brave web search configured: ${braveReady}.`,
      userPrompt: JSON.stringify({
        objective: input.objective,
        decision_context: input.decisionContext,
        question: input.question,
        max_searches: maxSearches,
        max_sources: maxSources,
      }),
      schema: researchPlanSchema,
      maxTokens: 1500,
    })

    spent += await recordCostUsage({
      category: 'research',
      taskId: input.taskId,
      tokensIn: 900,
      tokensOut: 400,
      model: plan.model,
      metadata: { phase: 'plan' },
    })
    tokens += 1300

    if (budgetExceeded() || tokens >= maxTokens) {
      return stop('stopped_budget', { stop_reason: 'budget_after_plan' })
    }

    if (!plan.data.should_research || plan.data.prior_is_sufficient) {
      const mem = await remember({
        category: 'research',
        title: `Skipped: ${input.question.slice(0, 80)}`,
        summary: plan.data.reason,
        confidence: 'medium',
        actorId: input.actorId,
        source: 'research_agent',
        tags: ['research', 'skipped'],
      })
      return stop('stopped_sufficient', {
        conclusion: plan.data.reason,
        confidence: 'medium',
        memory_id: mem?.id,
        stop_reason: 'planner_sufficient',
      })
    }

    if (!braveReady) {
      // Honest: no fake web results — synthesize only from model + note not configured
      const synth = await generateMarketingJson({
        systemPrompt: `Web search is NOT configured. Do not invent URLs or quotes.
Say clearly that live web research is unavailable.
Give only what can be inferred from the decision context without browsing.`,
        userPrompt: JSON.stringify({
          objective: input.objective,
          decision_context: input.decisionContext,
          question: input.question,
        }),
        schema: researchSynthSchema,
        maxTokens: 1500,
      })
      spent += await recordCostUsage({
        category: 'research',
        taskId: input.taskId,
        tokensIn: 800,
        tokensOut: 500,
        model: synth.model,
        metadata: { phase: 'synth_no_search' },
      })
      return stop('not_configured', {
        conclusion: synth.data.conclusion,
        key_findings: synth.data.key_findings,
        confidence: 'low',
        error: 'BRAVE_SEARCH_API_KEY / JARVIS_WEB_SEARCH_PROVIDER=brave not configured',
        stop_reason: 'search_not_configured',
        note: 'No web search performed. Configure Brave to enable real research.',
        decision_influence: synth.data.decision_influence,
      } as Partial<ResearchJobResult>)
    }

    const planned = plan.data.searches.slice(0, maxSearches)

    for (const q of planned) {
      if (runtimeExceeded()) return stop('stopped_runtime', { stop_reason: 'runtime' })
      if (budgetExceeded()) return stop('stopped_budget', { stop_reason: 'budget' })
      if (searchesUsed >= maxSearches)
        return stop('stopped_search_limit', { stop_reason: 'search_limit' })
      if (sources.length >= maxSources)
        return stop('stopped_sources', { stop_reason: 'source_limit' })
      if (tokens >= maxTokens) return stop('stopped_budget', { stop_reason: 'token_limit' })

      queries.push(q)
      const search = await braveWebSearch(q, {
        count: Math.min(5, maxSources - sources.length),
      })
      searchesUsed += 1
      spent += search.costUsd
      await recordCostUsage({
        category: 'research',
        taskId: input.taskId,
        costUsd: search.costUsd,
        provider: 'brave',
        toolName: 'research.brave_search',
        metadata: { query: q, ok: search.ok },
      })

      if (!search.ok) {
        sources.push({
          title: q,
          note: search.error || `Search failed (${search.error_code || 'provider_error'})`,
          retrieved_at: search.retrieved_at,
        })
        continue
      }
      if (search.error_code === 'empty' || search.results.length === 0) {
        sources.push({
          title: q,
          note: search.error || 'Brave returned no web results',
          retrieved_at: search.retrieved_at,
        })
        continue
      }
      for (const r of search.results) {
        if (sources.length >= maxSources) break
        sources.push({
          title: r.title,
          url: r.url,
          domain: r.domain,
          note: r.description,
          retrieved_at: r.retrieved_at,
        })
      }

      // Early stop if we already have enough diverse sources for synthesis
      if (sources.filter((s) => s.url).length >= Math.min(4, maxSources) && searchesUsed >= 2) {
        // Check sufficiency with a light synth gate
        break
      }
    }

    if (runtimeExceeded()) {
      // still try to synthesize what we have if any sources
    }

    if (sources.filter((s) => s.url).length === 0) {
      return stop('failed', {
        error: 'No usable sources returned from Brave',
        stop_reason: 'no_sources',
      })
    }

    if (budgetExceeded() && sources.length === 0) {
      return stop('stopped_budget', { stop_reason: 'budget_before_synth' })
    }

    const synth = await generateMarketingJson({
      systemPrompt: `Synthesize LURVOX research for ONE decision.
Use only provided sources. Do not invent URLs.
Cross-check conflicting claims when sources disagree.
Distinguish ₹99 vs ₹1,699 funnel economics if relevant.
If evidence is weak, say so and set sufficient=false.`,
      userPrompt: JSON.stringify({
        objective: input.objective,
        decision_context: input.decisionContext,
        question: input.question,
        sources,
        stop_when: plan.data.stop_when,
      }),
      schema: researchSynthSchema,
      maxTokens: 2000,
    })

    spent += await recordCostUsage({
      category: 'research',
      taskId: input.taskId,
      tokensIn: 1600,
      tokensOut: 900,
      model: synth.model,
      metadata: { phase: 'synth' },
    })
    tokens += 2500

    const mem = await remember({
      category: 'research',
      title: input.question.slice(0, 120),
      summary: synth.data.conclusion,
      confidence: synth.data.confidence,
      actorId: input.actorId,
      source: 'research_agent',
      tags: ['research', 'brave'],
      details: {
        findings: synth.data.key_findings,
        decision_influence: synth.data.decision_influence,
        sources: sources.slice(0, maxSources),
        queries,
        conflicting_claims: synth.data.conflicting_claims,
      },
    })

    const finalStatus: ResearchJobResult['status'] = synth.data.sufficient
      ? 'completed'
      : 'stopped_sufficient'

    return stop(finalStatus, {
      conclusion: synth.data.conclusion,
      key_findings: synth.data.key_findings,
      confidence: synth.data.confidence,
      memory_id: mem?.id,
      stop_reason: synth.data.sufficient ? 'objective_answered' : 'partial_evidence',
      decision_influence: synth.data.decision_influence,
    } as Partial<ResearchJobResult>)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Research failed'
    return stop('failed', { error: message, stop_reason: 'exception' })
  }
}
