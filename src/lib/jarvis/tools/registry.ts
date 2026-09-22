import { z } from 'zod'
import type { JarvisRiskClass, ToolExecutionContext } from '@/lib/jarvis/types'

export type JarvisToolDefinition<TIn = unknown, TOut = unknown> = {
  name: string
  description: string
  riskClass: JarvisRiskClass
  estimatedCostUsd: number
  timeoutMs: number
  tokenBudget: number
  /** If true, SIGNIFICANT tools still need human approval even when autonomy would allow. */
  requiresApproval?: boolean
  /** Can run without chat (background). READ/LOW_RISK typically true. */
  canRunAutonomously: boolean
  auditRequired: boolean
  inputSchema: z.ZodType<TIn>
  execute: (input: TIn, ctx: ToolExecutionContext) => Promise<TOut>
}

const registry = new Map<string, JarvisToolDefinition>()

export function registerTool<TIn, TOut>(tool: JarvisToolDefinition<TIn, TOut>): void {
  if (registry.has(tool.name)) {
    // Idempotent re-register for hot reload / phase expansions
    registry.set(tool.name, tool as JarvisToolDefinition)
    return
  }
  registry.set(tool.name, tool as JarvisToolDefinition)
}

export function getTool(name: string): JarvisToolDefinition | undefined {
  return registry.get(name)
}

export function listTools(): JarvisToolDefinition[] {
  return [...registry.values()]
}

export function toolCatalogForPrompt(): string {
  return listTools()
    .map(
      (t) =>
        `- ${t.name} [${t.riskClass}] cost~$${t.estimatedCostUsd}: ${t.description}`
    )
    .join('\n')
}

/** Forbidden tools — Jarvis must never self-modify safety controls. */
export const FORBIDDEN_TOOL_NAMES = new Set([
  'system.set_permissions',
  'system.raise_budget',
  'system.disable_audit',
  'system.enable_live_meta',
  'shopify.change_payment_settings',
  'shopify.change_credentials',
  'shopify.billing',
  'instagram.change_credentials',
  'instagram.modify_settings',
])
