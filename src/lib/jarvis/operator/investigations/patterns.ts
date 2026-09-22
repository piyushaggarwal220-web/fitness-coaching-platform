/**
 * Named investigation patterns — route to existing investigateBusinessQuestion.
 * Does not duplicate metric loaders.
 */

import {
  investigateBusinessQuestion,
  type InvestigateInput,
} from '@/lib/jarvis/core/investigate'

export type InvestigationPatternId =
  | 'business_health'
  | 'sales_drop'
  | 'sales_growth'
  | 'ad_performance'
  | 'funnel_performance'
  | 'creative_performance'
  | 'instagram_performance'
  | 'shopify_performance'
  | 'budget_efficiency'
  | 'customer_acquisition'
  | 'content_opportunity'
  | 'business_anomaly'
  | 'daily_report'
  | 'weekly_report'

export type InvestigationPattern = {
  id: InvestigationPatternId
  title: string
  default_objective: string
  systems_allowed: NonNullable<InvestigateInput['systemsAllowed']>
  days: number
  max_tool_calls: number
  max_cost_usd: number
  match: (q: string) => boolean
}

export const INVESTIGATION_PATTERNS: InvestigationPattern[] = [
  {
    id: 'business_health',
    title: 'Business health',
    default_objective: 'How is the LURVOX business doing today?',
    systems_allowed: ['lurvox', 'meta', 'memory'],
    days: 1,
    max_tool_calls: 6,
    max_cost_usd: 0.2,
    match: (q) =>
      /\b(how.*(business|we).*doing|business health|overview today|daily brief)\b/i.test(q),
  },
  {
    id: 'sales_drop',
    title: 'Sales drop',
    default_objective: 'Why are LURVOX sales down?',
    systems_allowed: ['lurvox', 'meta', 'memory', 'instagram'],
    days: 7,
    max_tool_calls: 8,
    max_cost_usd: 0.25,
    match: (q) =>
      /\b(sales? (down|drop|fell|falling|declin)|why.*(revenue|sales).*(down|drop)|revenue drop)\b/i.test(
        q
      ),
  },
  {
    id: 'sales_growth',
    title: 'Sales growth',
    default_objective: 'Why are LURVOX sales up?',
    systems_allowed: ['lurvox', 'meta', 'memory'],
    days: 7,
    max_tool_calls: 8,
    max_cost_usd: 0.25,
    match: (q) => /\b(sales? (up|growth|grew|rising)|why.*(revenue|sales).*(up|grow))\b/i.test(q),
  },
  {
    id: 'ad_performance',
    title: 'Ad performance',
    default_objective: 'How are Meta ads performing?',
    systems_allowed: ['meta', 'memory'],
    days: 7,
    max_tool_calls: 6,
    max_cost_usd: 0.2,
    match: (q) => /\b(ads?|meta|cpa|roas|campaign|ad set|adset)\b/i.test(q) && !/\bshopify\b/i.test(q),
  },
  {
    id: 'funnel_performance',
    title: 'Funnel performance',
    default_objective: 'How are the LURVOX funnels performing?',
    systems_allowed: ['lurvox', 'meta', 'memory'],
    days: 7,
    max_tool_calls: 6,
    max_cost_usd: 0.2,
    match: (q) => /\b(funnel|₹\s*99|99 funnel|1,?699|1699)\b/i.test(q),
  },
  {
    id: 'creative_performance',
    title: 'Creative performance',
    default_objective: 'Which creatives are winning or fatiguing?',
    systems_allowed: ['meta', 'memory'],
    days: 14,
    max_tool_calls: 5,
    max_cost_usd: 0.15,
    match: (q) => /\b(creative|ad creative|fatigue|winner|loser)\b/i.test(q),
  },
  {
    id: 'instagram_performance',
    title: 'Instagram performance',
    default_objective: 'How is Instagram organic performing?',
    systems_allowed: ['instagram', 'memory'],
    days: 14,
    max_tool_calls: 6,
    max_cost_usd: 0.2,
    match: (q) => /\b(instagram|reel|organic|ig )\b/i.test(q),
  },
  {
    id: 'shopify_performance',
    title: 'Shopify performance',
    default_objective: 'How is the Shopify store performing?',
    systems_allowed: ['shopify', 'memory'],
    days: 7,
    max_tool_calls: 5,
    max_cost_usd: 0.15,
    match: (q) => /\b(shopify|storefront|store orders?)\b/i.test(q),
  },
  {
    id: 'budget_efficiency',
    title: 'Budget efficiency',
    default_objective: 'Is Meta spend efficient vs CPA/ROAS targets?',
    systems_allowed: ['meta', 'memory'],
    days: 7,
    max_tool_calls: 6,
    max_cost_usd: 0.2,
    match: (q) => /\b(budget|efficiency|waste|overspend|underspend)\b/i.test(q),
  },
  {
    id: 'customer_acquisition',
    title: 'Customer acquisition',
    default_objective: 'How is customer acquisition performing (Meta CPA vs LURVOX purchases)?',
    systems_allowed: ['lurvox', 'meta', 'memory'],
    days: 7,
    max_tool_calls: 7,
    max_cost_usd: 0.22,
    match: (q) => /\b(acquisition|cac|new customers?|purchases?\b)/i.test(q),
  },
  {
    id: 'content_opportunity',
    title: 'Content opportunity',
    default_objective: 'What Instagram content opportunities exist?',
    systems_allowed: ['instagram', 'memory'],
    days: 14,
    max_tool_calls: 6,
    max_cost_usd: 0.2,
    match: (q) => /\b(content (idea|opportunit)|what to post|content gap)\b/i.test(q),
  },
  {
    id: 'business_anomaly',
    title: 'Business anomaly',
    default_objective: 'What meaningful business anomalies exist right now?',
    systems_allowed: ['lurvox', 'meta', 'memory'],
    days: 7,
    max_tool_calls: 8,
    max_cost_usd: 0.25,
    match: (q) => /\b(anomal|unusual|spike|sudden|alert|what.*(wrong|broken))\b/i.test(q),
  },
  {
    id: 'daily_report',
    title: 'Daily report',
    default_objective: 'Produce a daily LURVOX business report for today/yesterday.',
    systems_allowed: ['lurvox', 'meta', 'memory'],
    days: 2,
    max_tool_calls: 6,
    max_cost_usd: 0.2,
    match: (q) => /\b(daily report|report for today|today'?s report)\b/i.test(q),
  },
  {
    id: 'weekly_report',
    title: 'Weekly report',
    default_objective: 'Produce a weekly LURVOX business report for the last 7 days.',
    systems_allowed: ['lurvox', 'meta', 'memory', 'instagram'],
    days: 7,
    max_tool_calls: 8,
    max_cost_usd: 0.25,
    match: (q) => /\b(weekly report|week'?s report|last 7 days report)\b/i.test(q),
  },
]

export function matchInvestigationPattern(question: string): InvestigationPattern | null {
  const q = question.trim()
  if (!q) return null
  for (const p of INVESTIGATION_PATTERNS) {
    if (p.match(q)) return p
  }
  return null
}

export function getInvestigationPattern(id: InvestigationPatternId): InvestigationPattern | null {
  return INVESTIGATION_PATTERNS.find((p) => p.id === id) ?? null
}

/**
 * Run a named pattern or auto-match from the question text.
 */
export async function runInvestigationPattern(input: {
  patternId?: InvestigationPatternId
  question?: string
  days?: number
  actorId?: string | null
  systemsAllowed?: InvestigateInput['systemsAllowed']
  maxToolCalls?: number
  maxCostUsd?: number
}) {
  const question = (input.question || '').trim()
  const pattern =
    (input.patternId ? getInvestigationPattern(input.patternId) : null) ||
    (question ? matchInvestigationPattern(question) : null)

  const objective = question || pattern?.default_objective || 'Investigate business state'
  const systems =
    input.systemsAllowed ||
    pattern?.systems_allowed ||
    (['lurvox', 'meta', 'memory'] as NonNullable<InvestigateInput['systemsAllowed']>)

  // Funnel-specific: keep objective explicit so model doesn't blend
  let finalObjective = objective
  if (/\b₹?\s*99\b/i.test(objective) && !/1,?699|1699/.test(objective)) {
    finalObjective = `${objective} — focus on the ₹99 funnel only; do not mix ₹1,699 economics.`
  } else if (/\b(1,?699|1699)\b/i.test(objective) && !/\b₹?\s*99\b/.test(objective.replace(/1,?699|1699/g, ''))) {
    finalObjective = `${objective} — focus on the ₹1,699 funnel only; do not mix ₹99 economics.`
  }

  const result = await investigateBusinessQuestion({
    objective: finalObjective,
    question: finalObjective,
    days: input.days ?? pattern?.days ?? 7,
    systemsAllowed: systems,
    maxToolCalls: input.maxToolCalls ?? pattern?.max_tool_calls ?? 8,
    maxCostUsd: input.maxCostUsd ?? pattern?.max_cost_usd ?? 0.25,
    actorId: input.actorId,
  })

  return {
    pattern_id: pattern?.id ?? null,
    pattern_title: pattern?.title ?? null,
    ...result,
  }
}
