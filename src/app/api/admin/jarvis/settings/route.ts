import { NextResponse } from 'next/server'
import { requireMarketingAdmin } from '@/lib/ai-marketing/auth'
import { getCostDashboard } from '@/lib/jarvis/cost/usage'
import { getJarvisBudgets, setJarvisSetting } from '@/lib/jarvis/cost/governor'
import { getAutonomyLevel, setAutonomyLevel } from '@/lib/ai-marketing/settings'
import type { AutonomyLevel } from '@/lib/ai-marketing/types'
import { liveMetaExecutionEnabled } from '@/lib/ai-marketing/autonomy'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const auth = await requireMarketingAdmin()
  if (!auth.ok) return auth.response
  const [cost, budgets, autonomy] = await Promise.all([
    getCostDashboard(),
    getJarvisBudgets(),
    getAutonomyLevel(),
  ])
  return NextResponse.json({
    success: true,
    cost,
    budgets,
    autonomy_level: autonomy,
    live_meta_execution: liveMetaExecutionEnabled(),
  })
}

/** Owner-only budget/autonomy updates via admin API — Jarvis tools cannot call this. */
export async function PATCH(request: Request) {
  const auth = await requireMarketingAdmin()
  if (!auth.ok) return auth.response

  const body = (await request.json().catch(() => ({}))) as {
    daily_ai_budget_usd?: number
    monthly_ai_budget_usd?: number
    per_task_budget_usd?: number
    per_research_budget_usd?: number
    per_chat_budget_usd?: number
    max_tokens_per_task?: number
    max_searches_per_research?: number
    max_tool_calls_per_task?: number
    max_runtime_minutes?: number
    background_enabled?: boolean
    autonomy_level?: number
    confirm_high_autonomy?: boolean
  }

  if (typeof body.autonomy_level === 'number') {
    const level = body.autonomy_level as AutonomyLevel
    const result = await setAutonomyLevel(level, {
      confirmHighAutonomy: Boolean(body.confirm_high_autonomy),
      updatedBy: auth.user.id,
    })
    if (!result.ok) {
      return NextResponse.json({ success: false, error: result.error }, { status: 400 })
    }
  }

  const updates: [string, unknown][] = []
  const numericKeys = [
    'daily_ai_budget_usd',
    'monthly_ai_budget_usd',
    'per_task_budget_usd',
    'per_research_budget_usd',
    'per_chat_budget_usd',
    'max_tokens_per_task',
    'max_searches_per_research',
    'max_tool_calls_per_task',
    'max_runtime_minutes',
  ] as const
  for (const key of numericKeys) {
    const value = body[key]
    if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
      updates.push([key, value])
    }
  }
  if (typeof body.background_enabled === 'boolean') {
    updates.push(['background_enabled', body.background_enabled])
  }

  for (const [key, value] of updates) {
    const res = await setJarvisSetting(key, value, auth.user.id, { allowProtected: true })
    if (!res.ok) {
      return NextResponse.json({ success: false, error: res.error }, { status: 400 })
    }
  }

  const [cost, budgets, autonomy] = await Promise.all([
    getCostDashboard(),
    getJarvisBudgets(),
    getAutonomyLevel(),
  ])
  return NextResponse.json({
    success: true,
    cost,
    budgets,
    autonomy_level: autonomy,
    live_meta_execution: liveMetaExecutionEnabled(),
  })
}
