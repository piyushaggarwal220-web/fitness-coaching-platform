import type { JarvisRiskClass, JarvisRiskLevel } from '@/lib/jarvis/types'
import { getTool, FORBIDDEN_TOOL_NAMES } from '@/lib/jarvis/tools/registry'
import { liveMetaExecutionEnabled } from '@/lib/ai-marketing/autonomy'

export type PermissionDecision =
  | {
      allowed: true
      mode: 'execute' | 'require_approval'
      riskClass: JarvisRiskClass
      riskLevel: JarvisRiskLevel
      reason: string
    }
  | {
      allowed: false
      riskClass: JarvisRiskClass
      riskLevel: JarvisRiskLevel
      reason: string
    }

function riskLevelForClass(c: JarvisRiskClass): JarvisRiskLevel {
  switch (c) {
    case 'READ':
      return 'low'
    case 'LOW_RISK':
      return 'low'
    case 'SIGNIFICANT':
      return 'medium'
    case 'DANGEROUS':
      return 'critical'
  }
}

/**
 * Central permission engine — ALL Jarvis tool executions must pass here.
 * Jarvis cannot bypass this. Live Meta ACTIVE writes stay gated by LIVE_META_EXECUTION_ENABLED.
 */
export async function evaluateToolPermission(input: {
  toolName: string
  approvedExecution?: boolean
  source?: 'chat' | 'cron' | 'event' | 'system'
}): Promise<PermissionDecision> {
  if (FORBIDDEN_TOOL_NAMES.has(input.toolName)) {
    return {
      allowed: false,
      riskClass: 'DANGEROUS',
      riskLevel: 'critical',
      reason: 'Forbidden: Jarvis cannot modify its own permissions, budgets, audit, or live Meta flag.',
    }
  }

  const tool = getTool(input.toolName)
  if (!tool) {
    return {
      allowed: false,
      riskClass: 'DANGEROUS',
      riskLevel: 'critical',
      reason: `Unknown tool: ${input.toolName}. Only registered tools may run.`,
    }
  }

  const riskClass = tool.riskClass
  const riskLevel = riskLevelForClass(riskClass)

  if (riskClass === 'DANGEROUS') {
    return {
      allowed: false,
      riskClass,
      riskLevel,
      reason: 'DANGEROUS actions are blocked by policy. Configure an explicit protected workflow if needed.',
    }
  }

  // Meta write tools that would go ACTIVE
  if (
    (input.toolName.startsWith('meta.') &&
      (input.toolName.includes('resume') ||
        input.toolName.includes('activate') ||
        input.toolName.includes('increase_budget') ||
        input.toolName.includes('decrease_budget'))) &&
    !liveMetaExecutionEnabled()
  ) {
    if (input.approvedExecution) {
      return {
        allowed: true,
        mode: 'require_approval',
        riskClass: 'SIGNIFICANT',
        riskLevel: 'high',
        reason:
          'LIVE_META_EXECUTION_ENABLED=false — ACTIVE Meta spend/activation stays blocked even after approval. Approval records intent only.',
      }
    }
    return {
      allowed: true,
      mode: 'require_approval',
      riskClass: 'SIGNIFICANT',
      riskLevel: 'high',
      reason: 'Meta ACTIVE write requires approval and LIVE_META_EXECUTION_ENABLED.',
    }
  }

  if (riskClass === 'READ' || riskClass === 'LOW_RISK') {
    if (input.source === 'cron' && !tool.canRunAutonomously) {
      return {
        allowed: false,
        riskClass,
        riskLevel,
        reason: 'Tool is not allowed to run autonomously in background.',
      }
    }
    return {
      allowed: true,
      mode: 'execute',
      riskClass,
      riskLevel,
      reason: `${riskClass} tools execute automatically when authorized.`,
    }
  }

  // SIGNIFICANT
  if (input.approvedExecution) {
    return {
      allowed: true,
      mode: 'execute',
      riskClass,
      riskLevel,
      reason: 'Human approval granted — executing SIGNIFICANT action.',
    }
  }

  // Always require explicit owner approval for SIGNIFICANT (autonomy 2 default).
  // Do not auto-escalate based on autonomy here — keeps unit tests offline-safe
  // and preserves LIVE_META_EXECUTION_ENABLED hard safety elsewhere.
  return {
    allowed: true,
    mode: 'require_approval',
    riskClass,
    riskLevel,
    reason: 'SIGNIFICANT action requires explicit owner approval before execution.',
  }
}
