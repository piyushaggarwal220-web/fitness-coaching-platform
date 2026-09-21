import { createAdminClient } from '@/lib/supabase/admin'
import {
  DEFAULT_JARVIS_BUDGETS,
  type JarvisBudgetConfig,
} from '@/lib/jarvis/types'

function asNumber(v: unknown, fallback: number): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string' && v.trim() && Number.isFinite(Number(v))) return Number(v)
  return fallback
}

function asBool(v: unknown, fallback: boolean): boolean {
  if (typeof v === 'boolean') return v
  if (v === 'true') return true
  if (v === 'false') return false
  return fallback
}

export async function getJarvisBudgets(): Promise<JarvisBudgetConfig> {
  const admin = createAdminClient()
  const { data } = await admin.from('jarvis_settings').select('key, value')
  const map = new Map((data ?? []).map((r) => [r.key as string, r.value]))
  const d = DEFAULT_JARVIS_BUDGETS
  return {
    daily_ai_budget_usd: asNumber(map.get('daily_ai_budget_usd'), d.daily_ai_budget_usd),
    monthly_ai_budget_usd: asNumber(map.get('monthly_ai_budget_usd'), d.monthly_ai_budget_usd),
    per_task_budget_usd: asNumber(map.get('per_task_budget_usd'), d.per_task_budget_usd),
    per_research_budget_usd: asNumber(
      map.get('per_research_budget_usd'),
      d.per_research_budget_usd
    ),
    per_chat_budget_usd: asNumber(map.get('per_chat_budget_usd'), d.per_chat_budget_usd),
    max_tokens_per_task: asNumber(map.get('max_tokens_per_task'), d.max_tokens_per_task),
    max_searches_per_research: asNumber(
      map.get('max_searches_per_research'),
      d.max_searches_per_research
    ),
    max_tool_calls_per_task: asNumber(
      map.get('max_tool_calls_per_task'),
      d.max_tool_calls_per_task
    ),
    max_runtime_minutes: asNumber(map.get('max_runtime_minutes'), d.max_runtime_minutes),
    autonomy_enabled: asBool(map.get('autonomy_enabled'), d.autonomy_enabled),
    background_enabled: asBool(map.get('background_enabled'), d.background_enabled),
  }
}

/** Jarvis cannot update these keys via tools — only admin UI/API. */
export const PROTECTED_JARVIS_SETTING_KEYS = new Set([
  'daily_ai_budget_usd',
  'monthly_ai_budget_usd',
  'per_task_budget_usd',
  'per_research_budget_usd',
  'per_chat_budget_usd',
  'max_tokens_per_task',
  'max_searches_per_research',
  'max_tool_calls_per_task',
  'max_runtime_minutes',
  'autonomy_enabled',
  'background_enabled',
])

export async function setJarvisSetting(
  key: string,
  value: unknown,
  actorId: string | null,
  opts?: { allowProtected?: boolean }
): Promise<{ ok: boolean; error?: string }> {
  if (PROTECTED_JARVIS_SETTING_KEYS.has(key) && !opts?.allowProtected) {
    return {
      ok: false,
      error: 'Jarvis cannot modify its own budget/permission settings. Use admin UI.',
    }
  }
  const admin = createAdminClient()
  const { error } = await admin.from('jarvis_settings').upsert({
    key,
    value: value as object,
    updated_at: new Date().toISOString(),
    updated_by: actorId,
  })
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}
