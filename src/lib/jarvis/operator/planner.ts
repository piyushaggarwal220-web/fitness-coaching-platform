/**
 * Multi-system operator plan templates — persisted via durable-plan on jarvis_tasks.
 */

import {
  buildDurablePlanFromToolCalls,
  type DurablePlan,
} from '@/lib/jarvis/core/durable-plan'
import type { InvestigationPatternId } from '@/lib/jarvis/operator/investigations/patterns'

export function buildOperatorPlanForIntent(input: {
  objective: string
  patternId?: InvestigationPatternId | null
}): DurablePlan {
  const obj = input.objective
  const pattern = input.patternId

  const steps: { tool: string; input: Record<string, unknown>; why: string }[] = []

  const pushInvestigate = (question: string, systems?: string[]) => {
    steps.push({
      tool: 'analytics.investigate',
      input: {
        objective: question,
        question,
        ...(systems ? { systems_allowed: systems } : {}),
        ...(pattern ? { pattern_id: pattern } : {}),
      },
      why: 'Cross-system investigation with OBSERVED/INFERRED/UNCERTAIN separation',
    })
  }

  if (pattern === 'business_health' || /\bhow.*(business|we).*doing\b/i.test(obj)) {
    steps.push({
      tool: 'lurvox.revenue',
      input: { preset: 'today' },
      why: 'Canonical LURVOX cash today (IST)',
    })
    steps.push({
      tool: 'lurvox.revenue',
      input: { preset: 'yesterday' },
      why: 'Compare vs yesterday',
    })
    steps.push({
      tool: 'funnels.performance',
      input: { days: 7 },
      why: 'Funnel-separated Meta performance',
    })
  } else if (pattern === 'sales_drop' || /\bsales? (down|drop)\b/i.test(obj)) {
    pushInvestigate(obj, ['lurvox', 'meta', 'memory', 'instagram'])
  } else if (pattern === 'funnel_performance' || /\bfunnel|₹\s*99|1699\b/i.test(obj)) {
    steps.push({
      tool: 'funnels.list',
      input: {},
      why: 'Configured funnel targets',
    })
    steps.push({
      tool: 'funnels.performance',
      input: { days: 7 },
      why: 'Funnel performance window',
    })
    if (/\b₹?\s*99\b/i.test(obj) && !/1699/.test(obj)) {
      steps.push({
        tool: 'analytics.investigate',
        input: {
          objective: `${obj} — ₹99 funnel only`,
          systems_allowed: ['lurvox', 'meta', 'memory'],
        },
        why: 'Keep ₹99 economics separate',
      })
    }
  } else if (pattern === 'instagram_performance' || /\binstagram\b/i.test(obj)) {
    steps.push({
      tool: 'instagram.status',
      input: {},
      why: 'Instagram connection + publishing gate',
    })
    steps.push({
      tool: 'instagram.content_performance',
      input: { limit: 30 },
      why: 'Local content performance fields',
    })
  } else if (pattern === 'shopify_performance' || /\bshopify\b/i.test(obj)) {
    steps.push({
      tool: 'shopify.status',
      input: {},
      why: 'Shopify connection',
    })
    steps.push({
      tool: 'shopify.order_stats',
      input: { days: 7 },
      why: 'Store commerce stats (not LURVOX cash)',
    })
  } else if (pattern === 'ad_performance' || /\b(ads?|cpa|roas|meta)\b/i.test(obj)) {
    steps.push({
      tool: 'meta.status',
      input: {},
      why: 'Meta integration + sync freshness',
    })
    steps.push({
      tool: 'funnels.performance',
      input: { days: 7 },
      why: 'Ad performance by funnel',
    })
  } else {
    pushInvestigate(obj)
  }

  return buildDurablePlanFromToolCalls({
    objective: obj,
    thinkingSummary: `Operator plan${pattern ? ` (${pattern})` : ''}`,
    toolCalls: steps.slice(0, 8),
  })
}
