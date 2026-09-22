/**
 * Resolve full policy facts from live config + tool context.
 */

import { liveMetaExecutionEnabled } from '@/lib/ai-marketing/autonomy'
import { getAutonomyLevel } from '@/lib/ai-marketing/settings'
import { liveInstagramPublishingEnabled } from '@/lib/jarvis/instagram'
import {
  classifyToolAction,
  systemForTool,
} from '@/lib/jarvis/execution/policy/classify'
import { getExecutionConfig } from '@/lib/jarvis/execution/policy/config'
import { evaluateExecutionPolicy } from '@/lib/jarvis/execution/policy/evaluate'
import type { PolicyFacts, PolicyResult } from '@/lib/jarvis/execution/policy/types'

export async function resolveAndEvaluatePolicy(input: {
  toolName: string
  riskClass: string
  riskLevel: string
  estimatedCostUsd: number
  source?: 'chat' | 'cron' | 'event' | 'system'
  approvedExecution?: boolean
  moneyImpactUsd?: number | null
  percentChange?: number | null
  duplicateRunning?: boolean
  alreadySucceeded?: boolean
  recentFailures?: number
}): Promise<{
  facts: PolicyFacts
  result: PolicyResult
  config: Awaited<ReturnType<typeof getExecutionConfig>>
}> {
  const config = await getExecutionConfig()
  const autonomy = await getAutonomyLevel().catch(() => 2)
  const classified = classifyToolAction(input.toolName)

  const facts: PolicyFacts = {
    tool_name: input.toolName,
    action_class: classified.action_class,
    system: systemForTool(input.toolName),
    risk_class: input.riskClass,
    risk_level: input.riskLevel,
    estimated_cost_usd: input.estimatedCostUsd,
    money_impact_usd: input.moneyImpactUsd ?? null,
    percent_change: input.percentChange ?? null,
    autonomy_level: autonomy,
    source: input.source ?? 'chat',
    approved_execution: Boolean(input.approvedExecution),
    live_meta_enabled: liveMetaExecutionEnabled(),
    live_instagram_publishing: liveInstagramPublishingEnabled(),
    shopify_writes_enabled: config.shopify_writes,
    video_publish_enabled: config.video_publish,
    execution_kill_switch: config.kill_switch,
    execution_mode: config.mode,
    dry_run: config.dry_run,
    shadow_mode: config.shadow_mode,
    canary_enabled: config.canary,
    reversibility: classified.reversibility,
    recent_failures: input.recentFailures ?? 0,
    duplicate_running: Boolean(input.duplicateRunning),
    already_succeeded: Boolean(input.alreadySucceeded),
  }

  return { facts, result: evaluateExecutionPolicy(facts), config }
}
