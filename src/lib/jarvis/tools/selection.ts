/**
 * Bounded tool catalog selection by objective family.
 * Model still only receives registered tools — never invents names.
 */

import { listTools, type JarvisToolDefinition } from '@/lib/jarvis/tools/registry'

export type ToolFamily =
  | 'BUSINESS'
  | 'MARKETING'
  | 'INSTAGRAM'
  | 'CONTENT_OPS'
  | 'AUTONOMOUS'
  | 'SHOPIFY'
  | 'VIDEO'
  | 'RESEARCH'
  | 'SYSTEM'
  | 'MEMORY'
  | 'ANALYTICS'

const FAMILY_PREFIX: Record<ToolFamily, string[]> = {
  BUSINESS: ['lurvox.'],
  MARKETING: ['meta.', 'funnels.', 'creatives.'],
  INSTAGRAM: ['instagram.'],
  CONTENT_OPS: ['content_ops.'],
  AUTONOMOUS: ['autonomous.'],
  SHOPIFY: ['shopify.'],
  VIDEO: ['video.'],
  RESEARCH: ['research.'],
  SYSTEM: ['system.', 'diagnostics.'],
  MEMORY: ['memory.'],
  ANALYTICS: ['analytics.'],
}

/** Always include these for safety / investigation / cost. */
const ALWAYS = new Set([
  'analytics.investigate',
  'analytics.business_snapshot',
  'system.cost_status',
  'system.why',
  'system.diagnose',
  'memory.search',
  'memory.remember',
  'memory.learning_query',
  'lurvox.revenue',
])

export function selectToolFamiliesForObjective(objective: string): ToolFamily[] {
  const q = objective.toLowerCase()
  const families = new Set<ToolFamily>(['SYSTEM', 'MEMORY', 'ANALYTICS', 'BUSINESS'])

  if (/\b(meta|ads?|cpa|roas|campaign|spend|creative)\b/.test(q)) families.add('MARKETING')
  if (/\b(instagram|reel|organic|caption|ig)\b/.test(q)) families.add('INSTAGRAM')
  if (
    /\b(content\s*ops|content\s*pipeline|content\s*queue|schedule\s*(next|this)|publish\s+(the|this|approved)|content\s*batch|calendar|what.*(review|blocking|footage)|weekly\s*content)\b/.test(
      q
    )
  ) {
    families.add('CONTENT_OPS')
    families.add('INSTAGRAM')
  }
  if (
    /\b(what happened|while i was away|overnight|morning brief|attention|take care of|business pulse|why are you telling|investigate (the |this )?(sales|cpa|drop)|what needs (my )?attention|what are you (working|waiting|planning))\b/.test(
      q
    )
  ) {
    families.add('AUTONOMOUS')
    families.add('ANALYTICS')
    families.add('BUSINESS')
  }
  if (/\b(shopify|storefront|store order)\b/.test(q)) families.add('SHOPIFY')
  if (/\b(video|shotstack|render|edit)\b/.test(q)) families.add('VIDEO')
  if (/\b(research|competitor|market|why.*(india|fitness))\b/.test(q)) families.add('RESEARCH')
  if (/\b(funnel|₹99|1699|1,699)\b/.test(q)) {
    families.add('MARKETING')
    families.add('BUSINESS')
  }
  if (/\b(sales|revenue|purchase|money|business)\b/.test(q)) {
    families.add('BUSINESS')
    families.add('MARKETING')
  }

  return [...families]
}

export function toolsForFamilies(families: ToolFamily[]): JarvisToolDefinition[] {
  const prefixes = families.flatMap((f) => FAMILY_PREFIX[f])
  return listTools().filter((t) => {
    if (ALWAYS.has(t.name)) return true
    return prefixes.some((p) => t.name.startsWith(p))
  })
}

export function boundedToolCatalogForPrompt(objective: string, maxTools = 40): string {
  const families = selectToolFamiliesForObjective(objective)
  const tools = toolsForFamilies(families)
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name))
    .slice(0, maxTools)

  const header = `Tool families for this objective: ${families.join(', ')}`
  const lines = tools.map(
    (t) => `- ${t.name} [${t.riskClass}] cost~$${t.estimatedCostUsd}: ${t.description}`
  )
  return [header, ...lines].join('\n')
}
