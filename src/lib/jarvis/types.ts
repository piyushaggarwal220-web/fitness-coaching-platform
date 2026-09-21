/** Shared types for LURVOX JARVIS — AI Business Operator */

export type JarvisRiskClass = 'READ' | 'LOW_RISK' | 'SIGNIFICANT' | 'DANGEROUS'

export type JarvisRiskLevel = 'low' | 'medium' | 'high' | 'critical'

export type JarvisBudgetConfig = {
  daily_ai_budget_usd: number
  monthly_ai_budget_usd: number
  per_task_budget_usd: number
  per_research_budget_usd: number
  per_chat_budget_usd: number
  max_tokens_per_task: number
  max_searches_per_research: number
  max_tool_calls_per_task: number
  max_runtime_minutes: number
  autonomy_enabled: boolean
  background_enabled: boolean
}

export const DEFAULT_JARVIS_BUDGETS: JarvisBudgetConfig = {
  daily_ai_budget_usd: Number(process.env.JARVIS_DAILY_AI_BUDGET_USD) || 10,
  monthly_ai_budget_usd: Number(process.env.JARVIS_MONTHLY_AI_BUDGET_USD) || 200,
  per_task_budget_usd: Number(process.env.JARVIS_PER_TASK_BUDGET_USD) || 1,
  per_research_budget_usd: Number(process.env.JARVIS_PER_RESEARCH_BUDGET_USD) || 0.5,
  per_chat_budget_usd: Number(process.env.JARVIS_PER_CHAT_BUDGET_USD) || 0.75,
  max_tokens_per_task: Number(process.env.JARVIS_MAX_TOKENS_PER_TASK) || 50000,
  max_searches_per_research: Number(process.env.JARVIS_MAX_SEARCHES_PER_RESEARCH) || 10,
  max_tool_calls_per_task: Number(process.env.JARVIS_MAX_TOOL_CALLS_PER_TASK) || 12,
  max_runtime_minutes: Number(process.env.JARVIS_MAX_RUNTIME_MINUTES) || 15,
  autonomy_enabled: process.env.JARVIS_AUTONOMY_ENABLED !== 'false',
  background_enabled: process.env.JARVIS_BACKGROUND_ENABLED !== 'false',
}

/** Rough USD cost estimate for OpenAI-class models (configurable via env). */
export function estimateTokenCostUsd(inputTokens: number, outputTokens: number): number {
  const inPerM = Number(process.env.JARVIS_COST_PER_M_INPUT_TOKENS) || 2.5
  const outPerM = Number(process.env.JARVIS_COST_PER_M_OUTPUT_TOKENS) || 10
  return (inputTokens / 1_000_000) * inPerM + (outputTokens / 1_000_000) * outPerM
}

export type JarvisStreamEvent =
  | { type: 'status'; message: string }
  | { type: 'tool_start'; tool: string; risk: JarvisRiskClass; input?: unknown }
  | { type: 'tool_result'; tool: string; ok: boolean; summary: string; risk: JarvisRiskClass }
  | { type: 'approval'; approval: JarvisApprovalCard }
  | { type: 'token'; text: string }
  | { type: 'message'; message: JarvisAssistantMessage }
  | { type: 'cost'; spent_usd: number; daily_spent_usd: number; daily_limit_usd: number }
  | { type: 'error'; error: string }
  | { type: 'done'; conversationId: string; taskId: string }

export type JarvisApprovalCard = {
  id: string
  action_label: string
  reason: string
  evidence: string[]
  current_state: Record<string, unknown>
  proposed_state: Record<string, unknown>
  expected_cost_note?: string | null
  risk_level: JarvisRiskLevel
  risk_class: JarvisRiskClass
  tool_name: string
  status: string
}

export type JarvisAssistantMessage = {
  id: string
  content: string
  structured?: Record<string, unknown>
  approval_ids?: string[]
  tool_call_ids?: string[]
  cost_usd?: number
}

export type ToolExecutionContext = {
  actorId: string | null
  conversationId: string | null
  taskId: string | null
  source: 'chat' | 'cron' | 'event' | 'system'
  /** When true, SIGNIFICANT tools may execute (post-approval). */
  approvedExecution?: boolean
  approvalId?: string | null
}
