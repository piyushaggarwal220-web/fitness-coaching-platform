import { createAdminClient } from '@/lib/supabase/admin'
import { getJarvisBudgets } from '@/lib/jarvis/cost/governor'
import { estimateTokenCostUsd } from '@/lib/jarvis/types'

export type CostGateResult =
  | { ok: true; dailySpent: number; dailyLimit: number; remaining: number }
  | { ok: false; reason: string; dailySpent: number; dailyLimit: number }

export async function getDailySpendUsd(date = new Date()): Promise<number> {
  const admin = createAdminClient()
  const day = date.toISOString().slice(0, 10)
  const { data } = await admin
    .from('jarvis_cost_usage')
    .select('actual_cost_usd, estimated_cost_usd')
    .eq('usage_date', day)
  return (data ?? []).reduce(
    (sum, r) => sum + (Number(r.actual_cost_usd) || Number(r.estimated_cost_usd) || 0),
    0
  )
}

export async function getMonthlySpendUsd(date = new Date()): Promise<number> {
  const admin = createAdminClient()
  const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1))
    .toISOString()
    .slice(0, 10)
  const { data } = await admin
    .from('jarvis_cost_usage')
    .select('actual_cost_usd, estimated_cost_usd')
    .gte('usage_date', start)
  return (data ?? []).reduce(
    (sum, r) => sum + (Number(r.actual_cost_usd) || Number(r.estimated_cost_usd) || 0),
    0
  )
}

/** Hard stop before any AI/tool spend when daily/monthly budgets exhausted. */
export async function assertAiBudgetAvailable(
  estimatedAdditionalUsd = 0
): Promise<CostGateResult> {
  const budgets = await getJarvisBudgets()
  const dailySpent = await getDailySpendUsd()
  const monthlySpent = await getMonthlySpendUsd()
  const dailyLimit = budgets.daily_ai_budget_usd
  const monthlyLimit = budgets.monthly_ai_budget_usd

  if (dailySpent + estimatedAdditionalUsd > dailyLimit) {
    return {
      ok: false,
      reason: `Daily AI budget exhausted ($${dailySpent.toFixed(4)} / $${dailyLimit}). Autonomous AI work is paused until the next day.`,
      dailySpent,
      dailyLimit,
    }
  }
  if (monthlySpent + estimatedAdditionalUsd > monthlyLimit) {
    return {
      ok: false,
      reason: `Monthly AI budget exhausted ($${monthlySpent.toFixed(4)} / $${monthlyLimit}).`,
      dailySpent,
      dailyLimit,
    }
  }
  return {
    ok: true,
    dailySpent,
    dailyLimit,
    remaining: Math.max(0, dailyLimit - dailySpent),
  }
}

export async function recordCostUsage(input: {
  provider?: string
  model?: string | null
  taskId?: string | null
  conversationId?: string | null
  toolName?: string | null
  category: 'chat' | 'tool' | 'research' | 'background' | 'image' | 'video' | 'other'
  tokensIn?: number
  tokensOut?: number
  costUsd?: number
  metadata?: Record<string, unknown>
}): Promise<number> {
  const tokensIn = input.tokensIn ?? 0
  const tokensOut = input.tokensOut ?? 0
  const cost =
    input.costUsd ?? estimateTokenCostUsd(tokensIn, tokensOut)
  const admin = createAdminClient()
  await admin.from('jarvis_cost_usage').insert({
    provider: input.provider ?? 'openai',
    model: input.model ?? null,
    task_id: input.taskId ?? null,
    conversation_id: input.conversationId ?? null,
    tool_name: input.toolName ?? null,
    category: input.category,
    tokens_in: tokensIn,
    tokens_out: tokensOut,
    estimated_cost_usd: cost,
    actual_cost_usd: cost,
    metadata: input.metadata ?? {},
  })
  return cost
}

export async function getCostDashboard() {
  const budgets = await getJarvisBudgets()
  const dailySpent = await getDailySpendUsd()
  const monthlySpent = await getMonthlySpendUsd()
  const admin = createAdminClient()
  const day = new Date().toISOString().slice(0, 10)
  const { data: byProvider } = await admin
    .from('jarvis_cost_usage')
    .select('provider, actual_cost_usd, estimated_cost_usd, tool_name, category')
    .eq('usage_date', day)

  const providers: Record<string, number> = {}
  for (const r of byProvider ?? []) {
    const p = String(r.provider || 'openai')
    providers[p] =
      (providers[p] || 0) + (Number(r.actual_cost_usd) || Number(r.estimated_cost_usd) || 0)
  }

  return {
    daily_spent_usd: dailySpent,
    daily_limit_usd: budgets.daily_ai_budget_usd,
    daily_remaining_usd: Math.max(0, budgets.daily_ai_budget_usd - dailySpent),
    monthly_spent_usd: monthlySpent,
    monthly_limit_usd: budgets.monthly_ai_budget_usd,
    by_provider: providers,
    paused: dailySpent >= budgets.daily_ai_budget_usd,
  }
}
