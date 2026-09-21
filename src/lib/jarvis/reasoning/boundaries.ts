/**
 * Deterministic reasoning guards for Jarvis operator replies.
 * Prompts alone are not enough — these helpers encode hard boundaries for
 * investigation routing, funnel attribution, and final-answer presentation.
 */

import {
  LURVOX_PRODUCT_REVENUE_METRIC,
  META_AD_PURCHASES_METRIC,
  SHOPIFY_STORE_COMMERCE_METRIC,
  dataSourcesForQuestion,
  type CatalogMetricId,
} from '@/lib/jarvis/metrics/source-of-truth'

const TOOL_NAME_LINE =
  /^\s*(?:[-*•]\s*)?(?:tool(?:s)?\s*(?:used|called|results?)?\s*[:：-]?\s*)?([a-z][a-z0-9_]*\.[a-z0-9_.]+)\s*$/gim

const KNOWN_TOOL_FRAGMENT =
  /\b(?:analytics|system|meta|shopify|lurvox|research|memory|diagnostics?)\.[a-z0-9_.]+\b/gi

export type FunnelPriceRow = { id: string; price_inr: number; name?: string; slug?: string }

/** Shopify Admin is loaded only when the question explicitly asks about Shopify. */
export function shouldLoadShopifyForQuestion(question: string): boolean {
  return dataSourcesForQuestion(question).includes(SHOPIFY_STORE_COMMERCE_METRIC)
}

/** Meta sync path is the priority when Meta performance is missing / never synced. */
export function shouldInvestigateMetaSyncFirst(input: {
  question: string
  lastSyncAt?: string | null
  metaConfigured?: boolean
}): boolean {
  const sources = dataSourcesForQuestion(input.question)
  const q = input.question.toLowerCase()
  const metaMentioned =
    /\bmeta\b/.test(q) ||
    sources.includes(META_AD_PURCHASES_METRIC) ||
    /\bads?\b spend|\bcpa\b|\broas\b|ad performance|marketing_performance/.test(q)
  const syncMissing = input.lastSyncAt == null
  if (metaMentioned && syncMissing) return true
  if (/\bmeta\b/.test(q) && (/\bmissing\b|\bunavailable\b|\bsync\b/.test(q))) return true
  return false
}

/**
 * Funnel identity must come from configured mapping (campaign/adset/ad → funnel_id).
 * Purchase amount / plan price alone never assigns a funnel.
 */
export function funnelIdFromPurchaseAmount(
  _amountInr: number,
  _funnels: FunnelPriceRow[]
): { funnel_id: null; attribution: 'unavailable'; reason: string } {
  return {
    funnel_id: null,
    attribution: 'unavailable',
    reason:
      'Funnel identity requires configured funnel mapping (campaign/ad/adset funnel_id). Purchase amount alone is not a source of truth.',
  }
}

/** True when a recommendation wrongly ties LURVOX Razorpay cash to Shopify orders. */
export function recommendsShopifyLurvoxReconcile(text: string): boolean {
  const t = text.toLowerCase()
  const mentionsLurvoxCash =
    /\blurvox\b/.test(t) ||
    /\bpurchases\b/.test(t) ||
    /\brazorpay\b/.test(t) ||
    /\brevenue\b/.test(t)
  const mentionsShopify = /\bshopify\b/.test(t)
  const reconcileIntent =
    /\breconcil/.test(t) ||
    /\bmatch(?:ing)?\b.*\borders?\b/.test(t) ||
    /\borders?\b.*\bmatch/.test(t) ||
    /\bexplain(?:s|ed)?\b.*\brevenue\b/.test(t) ||
    /\bshopify\b.*\b(?:explains?|accounts? for|equals?)\b/.test(t) ||
    /\b(?:explains?|accounts? for)\b.*\bshopify\b/.test(t) ||
    /\b₹\s*0\b.*\bshopify\b/.test(t) ||
    /\bshopify\b.*\b₹\s*0\b/.test(t)
  return mentionsLurvoxCash && mentionsShopify && reconcileIntent
}

export function separateCommerceSystemsNote(): string {
  return [
    'Separate systems — do not reconcile unless an explicit verified relationship exists:',
    'LURVOX revenue → public.purchases (Razorpay captured amount_paise)',
    'Shopify store commerce → Shopify Admin',
    'Meta advertising → marketing_performance',
  ].join('\n')
}

export function investigationSystemGuardrails(): string {
  return `REASONING BOUNDARIES (hard):
1. LURVOX cash revenue is public.purchases (Razorpay captured amount_paise). Shopify Admin is a separate commerce source. Never recommend reconciling LURVOX Razorpay payments against Shopify orders unless evidence includes an explicit verified relationship between those paths. Shopify ₹0 does not explain LURVOX revenue.
2. If Meta performance is unavailable because lastSyncAt is null, investigate the Meta sync path (credentials, ad account, campaigns, insights, sync history/errors, config flags) before dwelling on unrelated Shopify reporting.
3. Never infer funnel_id from purchase amount or plan price. Funnel identity comes only from configured funnel mapping. If unverified, say attribution is unavailable.
4. Do not invent a root cause. If unknown, state exactly what is unknown.
5. Final owner-facing answer is concise (bottom line / finding, ≤3 evidence bullets, next step). Deep evidence stays in structured tool results — do not dump full diagnostic traces into the prose. Do not append raw tool names.`
}

/**
 * Strip raw registered tool names from the main natural-language answer.
 * Tool traces stay in structured evidence / timeline, not the operator prose.
 */
export function stripRawToolNamesFromReply(text: string): string {
  if (!text) return text
  const lines = text.split(/\r?\n/)
  const kept: string[] = []
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) {
      kept.push(line)
      continue
    }
    // Whole line is one or more tool names
    const onlyTools = trimmed
      .split(/[\s,;|/]+/)
      .filter(Boolean)
      .every((part) => /^[a-z][a-z0-9_]*\.[a-z0-9_.]+$/i.test(part))
    if (onlyTools && /[a-z]+\.[a-z]/i.test(trimmed)) continue
    if (TOOL_NAME_LINE.test(trimmed)) {
      TOOL_NAME_LINE.lastIndex = 0
      continue
    }
    TOOL_NAME_LINE.lastIndex = 0
    // Drop trailing "Tools used: a.b, c.d" style appendices
    if (/^(?:tools?(?:\s+used)?|evidence\s+tools?|ran|called)\s*[:：]/i.test(trimmed) && KNOWN_TOOL_FRAGMENT.test(trimmed)) {
      KNOWN_TOOL_FRAGMENT.lastIndex = 0
      continue
    }
    KNOWN_TOOL_FRAGMENT.lastIndex = 0
    kept.push(line.replace(KNOWN_TOOL_FRAGMENT, '').replace(/[ \t]{2,}/g, ' ').replace(/\s+([,.;])/g, '$1'))
  }
  return kept
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export function containsRawToolName(text: string): boolean {
  return /\b(?:analytics|system|meta|shopify|lurvox|research|memory|diagnostics?)\.[a-z0-9_.]+\b/i.test(
    text
  )
}

export function sourcesLabel(sources: CatalogMetricId[]): string {
  return sources
    .map((s) => {
      if (s === LURVOX_PRODUCT_REVENUE_METRIC) return 'LURVOX revenue (public.purchases)'
      if (s === SHOPIFY_STORE_COMMERCE_METRIC) return 'Shopify store commerce (Shopify Admin)'
      if (s === META_AD_PURCHASES_METRIC) return 'Meta advertising (marketing_performance)'
      return s
    })
    .join('; ')
}

/** Active investigation timeline is terminal only when no step is still active/pending. */
export function investigationTimelineIsActive(
  steps: { state: string }[],
  busy: boolean
): boolean {
  if (busy) return true
  return steps.some((s) => s.state === 'active' || s.state === 'pending')
}

/** Past activity on an idle operator must not stay in Analyzing/Investigating. */
export function operatorTimelineStateForIdleActivity(kind: string): string {
  switch (kind) {
    case 'ANALYSIS':
    case 'RESEARCH':
    case 'OBSERVATION':
    case 'ACTION':
      return 'Completed'
    case 'APPROVAL':
      return 'Waiting for approval'
    case 'ERROR':
      return 'Failed'
    default:
      return 'Completed'
  }
}
