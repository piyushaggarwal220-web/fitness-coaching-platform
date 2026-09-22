/**
 * Verified business-metric sources for Jarvis.
 *
 * This file is the in-repo catalog. Prompts, tool names, folder names, and
 * jarvis_memory rows are not sources of truth. Update this catalog when a
 * metric is proven (or proven conflicting) — do not invent unverified rows.
 *
 * Incident JARVIS-20260920-REV1: Shopify Admin orders are not LURVOX checkout revenue.
 */

import { BUSINESS_TIMEZONE } from '@/lib/jarvis/diagnostics/provenance'

export const SOURCE_OF_TRUTH_NOT_VERIFIED = 'Source of truth not verified.' as const
export const LURVOX_PRODUCT_REVENUE_METRIC = 'lurvox_product_revenue'
export const SHOPIFY_STORE_COMMERCE_METRIC = 'shopify_store_commerce'
export const META_AD_PURCHASES_METRIC = 'meta_ad_purchases'
export const INSTAGRAM_ORGANIC_ENGAGEMENT_METRIC = 'instagram_organic_engagement'

export type MetricAlignment = 'aligned' | 'mismatch_pending_approval' | 'unverified'

export type MetricSourceOfTruth = {
  metric: string
  business_concept: string
  source_of_truth: string | typeof SOURCE_OF_TRUTH_NOT_VERIFIED
  source_of_truth_verified: boolean
  accepted_sources: string[]
  code_path: string[]
  database_or_api: string
  calculation: string
  timezone: string
  refund_adjustment: string
  data_status_rule: string
  existing_tests: string[]
  jarvis_current: {
    source: string
    tool: string
    code_path: string
  }
  alignment: MetricAlignment
  do_not: string[]
  incident?: string
}

/**
 * LURVOX cash sales: Razorpay checkout writes `public.purchases`.
 * Shared math lives in src/lib/payments/purchase-revenue.ts (also used by admin P&L).
 */
export const LURVOX_PRODUCT_REVENUE: MetricSourceOfTruth = {
  metric: LURVOX_PRODUCT_REVENUE_METRIC,
  business_concept: 'LURVOX product/coaching cash sales (Razorpay checkout, not Shopify)',
  source_of_truth: 'public.purchases where status = captured; amount_paise / 100 = INR',
  source_of_truth_verified: true,
  accepted_sources: ['public.purchases', 'purchases'],
  code_path: [
    'src/lib/payments/purchase-revenue.ts',
    'src/lib/admin/business-analytics.ts',
    'src/lib/jarvis/metrics/lurvox-revenue.ts',
    'src/lib/payments/fulfillment.ts (recordCapturedPayment)',
  ],
  database_or_api: 'Supabase public.purchases (amount_paise, currency, status, created_at)',
  calculation:
    'Shared purchase-revenue.ts: gross = captured amount_paise/100; refunds = refunded_amount_paise/100 on captured|refunded; redeemed codes are not cash. Day windows are Asia/Kolkata via src/lib/time/business-calendar.ts (shared by Admin P&L and Jarvis).',
  timezone: `${BUSINESS_TIMEZONE} calendar days for Admin P&L and Jarvis (businessToday / businessYesterday / lastNCalendarDays / calendarDateRange).`,
  refund_adjustment:
    'refunded_amount_paise via shared refundsInr(). Gross vs net must be labeled. Redeemed rows are not cash.',
  data_status_rule:
    'Query/API failure ≠ 0. Empty captured set after a successful query is an explicit zero. Missing table/permission/timeout is unavailable.',
  existing_tests: [
    'scripts/verify-purchase-flow.ts',
    'scripts/verify-payment-operations.ts',
    'scripts/verify-refund-eligibility.ts',
    'scripts/verify-jarvis.ts',
  ],
  jarvis_current: {
    source: 'public.purchases via loadLurvoxRevenue / lurvox.revenue',
    tool: 'lurvox.revenue',
    code_path:
      'src/lib/jarvis/metrics/lurvox-revenue.ts, src/lib/jarvis/operator-pulse.ts, src/lib/jarvis/tools/builtins.ts',
  },
  alignment: 'aligned',
  do_not: [
    'Treat shopify.today_revenue as LURVOX checkout revenue',
    'Treat Meta marketing_performance.purchases as cash sales',
    'Duplicate the captured amount_paise formula inside Jarvis',
    'Apply the unrelated Shopify UTC-window patch as part of this ledger',
  ],
  incident: 'JARVIS-20260920-REV1',
}

/** Shopify storefront/Admin commerce only. Verified empty of LURVOX coaching orders on the connected shop. */
export const SHOPIFY_STORE_COMMERCE: MetricSourceOfTruth = {
  metric: SHOPIFY_STORE_COMMERCE_METRIC,
  business_concept: 'Shopify Admin order revenue on the connected shop',
  source_of_truth: 'Shopify Admin REST/GraphQL orders for SHOPIFY_SHOP',
  source_of_truth_verified: true,
  accepted_sources: ['shopify', 'shopify_admin'],
  code_path: ['src/lib/jarvis/shopify/client.ts (shopifyTodayCommerce, shopifyOrderStats)'],
  database_or_api: 'Shopify Admin API (not public.purchases)',
  calculation: 'Sum Shopify order totals in the client window. Currently UTC midnight until an approved timezone change.',
  timezone: `Shop TZ is ${BUSINESS_TIMEZONE}; Jarvis window is UTC until approved otherwise (separate incident).`,
  refund_adjustment: 'Shopify order refunds if present on Admin orders. Not LURVOX Razorpay refunds.',
  data_status_rule:
    'HTTP/GraphQL failure ≠ 0. ordersCount EXACT 0 after a successful read is verified empty, not a data failure.',
  existing_tests: ['scripts/verify-jarvis.ts'],
  jarvis_current: {
    source: 'Shopify Admin orders',
    tool: 'shopify.today_revenue',
    code_path: 'src/lib/jarvis/shopify/client.ts',
  },
  alignment: 'aligned',
  do_not: [
    'Use this metric as "how the LURVOX coaching business is doing"',
    'Force Shopify to return Razorpay checkout sales',
  ],
  incident: 'JARVIS-20260920-3KB4',
}

/** Meta ads conversion count. Not LURVOX cash revenue. */
export const META_AD_PURCHASES: MetricSourceOfTruth = {
  metric: META_AD_PURCHASES_METRIC,
  business_concept: 'Meta-reported ad purchases / conversions (ads performance, not the cash ledger)',
  source_of_truth: 'marketing_performance (synced from Meta insights) via getMarketingOverview / funnel summaries',
  source_of_truth_verified: true,
  accepted_sources: ['meta', 'marketing_performance'],
  code_path: [
    'src/lib/ai-marketing/overview.ts',
    'src/lib/ai-marketing/funnels.ts',
    'src/lib/ai-marketing/meta/sync.ts',
    'src/lib/jarvis/operator-pulse.ts (pulse cell labeled Purchases)',
  ],
  database_or_api: 'public.marketing_performance + Meta Marketing API',
  calculation: 'Ad-platform purchase/conversion counts and attributed revenue fields. Never treat as Razorpay captured cash.',
  timezone: 'Meta report windows as stored; do not silently convert to IST cash-day totals.',
  refund_adjustment: 'Not the Razorpay refund ledger.',
  data_status_rule: 'Missing sync / API failure ≠ 0 purchases. Empty table after a successful read may be explicit zero.',
  existing_tests: ['scripts/verify-ai-marketing.ts', 'scripts/verify-jarvis.ts'],
  jarvis_current: {
    source: 'Meta marketing_performance via funnel summaries',
    tool: 'analytics.today_overview (ads half) / pulse Purchases',
    code_path: 'src/lib/jarvis/operator-pulse.ts, src/lib/jarvis/tools/builtins.ts',
  },
  alignment: 'aligned',
  do_not: [
    'Call this "revenue"',
    'Blend ₹99 and ₹1,699 funnels',
    'Use ad spend as revenue',
  ],
}

/**
 * Instagram organic engagement + content intelligence.
 * Local drafts/plans/manual metrics: marketing_content.
 * Live account/media/insights: Instagram Graph (provider-dependent scopes).
 * Historical organic metrics: marketing_instagram_metric_snapshots (not Meta ads).
 */
export const INSTAGRAM_ORGANIC_ENGAGEMENT: MetricSourceOfTruth = {
  metric: INSTAGRAM_ORGANIC_ENGAGEMENT_METRIC,
  business_concept: 'Instagram organic content engagement (not Meta ads, not LURVOX cash)',
  source_of_truth:
    'Split: (1) local marketing_content for plans/drafts/manual metrics; (2) Instagram Graph live reads; (3) marketing_instagram_metric_snapshots for historical organic metrics after instagram.sync_content',
  source_of_truth_verified: true,
  accepted_sources: [
    'marketing_content',
    'instagram.graph',
    'instagram',
    'marketing_instagram_metric_snapshots',
    'marketing_instagram_media',
  ],
  code_path: [
    'src/lib/jarvis/instagram/content-store.ts',
    'src/lib/jarvis/instagram/analysis.ts',
    'src/lib/jarvis/instagram/provider.ts',
    'src/lib/jarvis/instagram/client.ts',
    'src/lib/jarvis/instagram/credentials.ts',
    'src/lib/jarvis/instagram/sync.ts',
    'src/lib/jarvis/instagram/snapshots.ts',
    'src/lib/jarvis/instagram/intelligence.ts',
    'src/lib/jarvis/instagram/planner.ts',
    'src/lib/jarvis/instagram/draft.ts',
    'src/lib/ai-marketing/agents/instagram.ts',
  ],
  database_or_api:
    'public.marketing_content (platform=instagram) + Instagram Graph via INSTAGRAM_ACCESS_TOKEN (graph.instagram.com) + public.marketing_instagram_media / marketing_instagram_metric_snapshots for history. META_ADS_ACCESS_TOKEN is Ads-only.',
  calculation:
    'Local score = sum of non-null likes+comments+shares+saves. Graph insights use provider metric values only when the field is present. Snapshot sync upserts one row per (account, media, metric, IST day). Explicit Meta 0 is verified zero; unavailable/unsupported stay NULL. Performance rates use median of per-post ratios where both sides are verified.',
  timezone: 'Snapshot days are Asia/Kolkata; Graph periods are provider-defined.',
  refund_adjustment: 'N/A — not a cash metric.',
  data_status_rule:
    'API failure / missing Graph config ≠ 0 followers/posts/engagement. Explicit empty media array after successful Graph read is verified zero for that page. Unsupported insights metrics are status=unsupported with null value.',
  existing_tests: [
    'scripts/verify-jarvis.ts',
    'scripts/verify-instagram-live.ts',
    'scripts/verify-instagram-operator-e2e.ts',
    'scripts/verify-instagram-intelligence.ts',
    'scripts/verify-video.ts',
  ],
  jarvis_current: {
    source: 'marketing_content + Instagram Graph + metric snapshots',
    tool: 'instagram.sync_content / instagram.analyze_performance / instagram.plan_content / instagram.generate_draft / instagram.media_insights',
    code_path: 'src/lib/jarvis/instagram/* + src/lib/jarvis/video/*',
  },
  alignment: 'aligned',
  do_not: [
    'Treat Meta ad purchases as Instagram organic engagement',
    'Convert unavailable Graph insights into 0 views/likes',
    'Claim causation from format/hook without verified experiment evidence',
    'Write organic metrics into marketing_performance (ads table)',
    'Claim video completed without provider output_video',
    'Publish Instagram content without approval / LIVE_INSTAGRAM_PUBLISHING_ENABLED',
    'Point VIDEO_EDIT_WEBHOOK_URL at www.lurvox.in (Shopify) — use https://app.lurvox.in/api/admin/jarvis/video-webhook',
  ],
}

export const METRIC_SOURCES: readonly MetricSourceOfTruth[] = [
  LURVOX_PRODUCT_REVENUE,
  SHOPIFY_STORE_COMMERCE,
  META_AD_PURCHASES,
  INSTAGRAM_ORGANIC_ENGAGEMENT,
]

export function getMetricSource(metric: string): MetricSourceOfTruth | null {
  return METRIC_SOURCES.find((m) => m.metric === metric) ?? null
}

/** Returns the catalog row, or SOURCE_OF_TRUTH_NOT_VERIFIED — never a guessed ledger. */
export function requireVerifiedMetricSource(
  metric: string
): MetricSourceOfTruth | typeof SOURCE_OF_TRUTH_NOT_VERIFIED {
  const row = getMetricSource(metric)
  if (!row || !row.source_of_truth_verified) return SOURCE_OF_TRUTH_NOT_VERIFIED
  return row
}

/** Catalog contract: a metric may only be served from its accepted_sources. */
export function sourceAllowedForMetric(metric: string, source: string): boolean {
  const row = requireVerifiedMetricSource(metric)
  if (row === SOURCE_OF_TRUTH_NOT_VERIFIED) return false
  const normalized = source.trim().toLowerCase()
  return row.accepted_sources.some((allowed) => allowed.toLowerCase() === normalized)
}

export type CatalogMetricId =
  | typeof LURVOX_PRODUCT_REVENUE_METRIC
  | typeof SHOPIFY_STORE_COMMERCE_METRIC
  | typeof META_AD_PURCHASES_METRIC
  | typeof INSTAGRAM_ORGANIC_ENGAGEMENT_METRIC

/** Deterministic routing for investigation + tests. Chat still uses tool descriptions. */
export function dataSourcesForQuestion(question: string): CatalogMetricId[] {
  const q = question.toLowerCase()
  const shopifyAsked = /\bshopify\b|\bstorefront\b|shopify store|shopify orders/.test(q)
  const metaAsked =
    /\bmeta\b|\bads?\b spend|ad spend|\bcpa\b|\broas\b|attributed purchase|meta-attributed/.test(q)
  const instagramAsked = /\binstagram\b|\breels?\b|organic (content|engagement)|ig (followers|reach)/.test(
    q
  )
  const revenueAsked =
    /\brevenue\b|\bmoney\b|how has my business|business been going|last \d+ days|paid sales/.test(q)

  const sources = new Set<CatalogMetricId>()
  if (shopifyAsked) sources.add(SHOPIFY_STORE_COMMERCE_METRIC)
  if (metaAsked) sources.add(META_AD_PURCHASES_METRIC)
  if (instagramAsked) sources.add(INSTAGRAM_ORGANIC_ENGAGEMENT_METRIC)
  if (revenueAsked && !shopifyAsked && !metaAsked && !instagramAsked) {
    sources.add(LURVOX_PRODUCT_REVENUE_METRIC)
  }
  if (!shopifyAsked && !metaAsked && !instagramAsked && !revenueAsked) {
    sources.add(LURVOX_PRODUCT_REVENUE_METRIC)
  }
  return [...sources]
}

export function jarvisMetricOperatorNotes(): string[] {
  return [
    'LURVOX product revenue = lurvox.revenue → public.purchases captured amount_paise (Asia/Kolkata). Never Shopify. Never Meta.',
    'shopify.today_revenue is Shopify store commerce only. Use it only for "how much did my Shopify store make / how many Shopify orders".',
    'Pulse "Purchases", CPA, ROAS, and ad spend are Meta marketing_performance. Do not call them LURVOX revenue.',
    'Instagram organic engagement is marketing_content and/or Instagram Graph — never Meta ad purchases and never cash revenue.',
    'Do not reconcile LURVOX Razorpay payments against Shopify orders unless an explicit verified relationship exists. Shopify ₹0 does not explain LURVOX revenue.',
    'Never assign funnel_id from purchase amount or plan price. Funnel identity requires configured mapping; otherwise attribution is unavailable.',
    'If Meta lastSyncAt is null, investigate Meta sync before unrelated Shopify reporting.',
    'If a metric is not in the source-of-truth catalog, say Source of truth not verified. Do not guess a table.',
    'API/query failure is not ₹0. Only a successful purchases query with zero captured rows is ₹0.',
  ]
}
