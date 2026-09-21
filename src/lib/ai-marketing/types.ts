/** Shared types for the LURVOX AI Marketing OS. */

export type AutonomyLevel = 0 | 1 | 2 | 3 | 4

export type MarketingActionType =
  | 'PAUSE_AD'
  | 'RESUME_AD'
  | 'INCREASE_BUDGET'
  | 'DECREASE_BUDGET'
  | 'KEEP_RUNNING'
  | 'CREATE_NEW_CREATIVE'
  | 'CREATE_NEW_TEST'
  | 'INVESTIGATE_FUNNEL'
  | 'NO_ACTION'
  | 'SYNC_META'
  | 'CREATE_CAMPAIGN'
  | 'CREATE_ADSET'
  | 'CREATE_AD'
  | 'CREATE_CREATIVE'
  | 'UPDATE_AD'
  | 'UPDATE_CAMPAIGN'
  | 'UPDATE_ADSET'
  | 'GENERATE_VARIATIONS'
  | 'LAUNCH_EXPERIMENT'
  | 'NOTIFY'
  | 'INCREASE_FUNNEL_BUDGET'
  | 'DECREASE_FUNNEL_BUDGET'
  | 'CONTINUE_TESTING_FUNNELS'
  | 'REALLOCATE_BUDGET_RECOMMENDATION'

export type RiskLevel = 'low' | 'medium' | 'high' | 'critical'

export type EvidenceStrength =
  | 'insufficient_data'
  | 'possible_issue'
  | 'strong_evidence'
  | 'recommended_test'

/**
 * Account-level safety caps only.
 * TARGET_CPA / TARGET_ROAS live on each marketing_funnels row — never globally.
 */
export type GuardrailSettings = {
  MIN_SPEND_BEFORE_PAUSE: number
  MIN_PURCHASES_FOR_WINNER: number
  MIN_DATA_BEFORE_PAUSE: number
  /** @deprecated Prefer funnel.target_cpa — kept for backward-compatible account defaults only */
  TARGET_CPA?: number
  /** @deprecated Prefer funnel.target_roas */
  TARGET_ROAS?: number
  MAX_DAILY_ACCOUNT_SPEND: number
  MAX_BUDGET_INCREASE_PERCENT: number
  MAX_BUDGET_DECREASE_PERCENT: number
  MAX_SINGLE_ACTION_SPEND: number
  MAX_SINGLE_TEST_SPEND: number
  CREATIVE_FATIGUE_THRESHOLD: number
  MIN_DATA_WINDOW_DAYS: number
  currency: string
}

export type MarketingFunnel = {
  id: string
  slug: string
  name: string
  offer: string
  product: string
  price_inr: number
  estimated_fulfillment_cost_inr: number
  contribution_margin_inr: number | null
  aov_inr: number | null
  target_cpa: number
  max_acceptable_cpa: number
  target_roas: number
  min_roas: number
  daily_budget_inr: number | null
  test_budget_inr: number | null
  max_daily_budget_inr: number | null
  max_budget_increase_percent: number
  max_budget_decrease_percent: number
  min_spend_before_pause: number
  min_purchases_for_winner: number
  min_data_window_days: number
  conversion_event: string
  landing_page: string | null
  checkout_url: string | null
  target_audience: string | null
  tracks_downstream_upsell: boolean
  downstream_funnel_id: string | null
  notes: string | null
  status: 'active' | 'paused' | 'archived'
  metadata: Record<string, unknown>
}

export type FunnelPerformanceSummary = {
  funnel_id: string | null
  funnel_slug: string | null
  funnel_name: string
  classified: boolean
  spend: number
  revenue: number
  purchases: number
  impressions: number
  clicks: number
  ctr: number | null
  cpc: number | null
  cpm: number | null
  cpa: number | null
  /** Initial ROAS = ad revenue / spend (offer AOV basis) */
  initial_roas: number | null
  conversion_rate: number | null
  aov: number | null
  contribution_margin_inr: number | null
  /** Downstream upsell revenue attributed separately (not mixed into initial ROAS) */
  downstream_revenue: number
  /** Blended customer value = (revenue + downstream) / purchases when purchases > 0 */
  blended_customer_value: number | null
  /** Blended ROAS including downstream — labeled separately from initial ROAS */
  blended_roas: number | null
  target_cpa: number | null
  max_acceptable_cpa: number | null
  target_roas: number | null
  min_roas: number | null
  price_inr: number | null
}

export type BrandContext = {
  name: string
  tagline: string
  products: { id: string; name: string; category: string; priceHint?: string }[]
  primary_audiences: string[]
  offers: string[]
  website: string
}

export type PerformanceRow = {
  date: string
  campaign_id?: string | null
  adset_id?: string | null
  ad_id?: string | null
  creative_id?: string | null
  meta_campaign_id?: string | null
  meta_adset_id?: string | null
  meta_ad_id?: string | null
  spend: number
  impressions: number
  reach: number
  clicks: number
  ctr?: number | null
  cpc?: number | null
  cpm?: number | null
  frequency?: number | null
  purchases: number
  revenue: number
  cpa?: number | null
  roas?: number | null
  is_mock?: boolean
}

export type CreativeConcept = {
  concept_name: string
  angle: string
  hook: string
  headline: string
  primary_text: string
  description: string
  cta: string
  visual_direction: string
  image_generation_prompt: string
  target_audience: string
  hypothesis: string
  expected_test_reason: string
}

export type AnalyticsFinding = {
  issue: string
  evidence: string[]
  evidence_strength: EvidenceStrength
  recommendation: string
  recommended_action: MarketingActionType
  confidence: number
  estimated_impact_category: 'low' | 'medium' | 'high'
  risk_level: RiskLevel
  entity_type?: string
  entity_id?: string
  requires_human_approval: boolean
  caveats: string[]
}

export type StructuredDecision = {
  decision: string
  reason: string
  evidence: string[]
  confidence: number
  recommended_action: MarketingActionType
  risk_level: RiskLevel
  entity_type?: string
  entity_id?: string
  parameters?: Record<string, unknown>
  estimated_impact?: string
}

export type MetaIntegrationStatus = {
  configured: boolean
  missing: string[]
  /** Extra vars needed for creating Meta creatives / tests (not required for sync) */
  writeMissing?: string[]
  adAccountId: string | null
  apiVersion: string
  lastSyncAt: string | null
  lastSyncError: string | null
  mode: 'live' | 'unconfigured'
  liveExecutionEnabled?: boolean
  pageIdConfigured?: boolean
}

export const DEFAULT_GUARDRAILS: GuardrailSettings = {
  MIN_SPEND_BEFORE_PAUSE: 1500,
  MIN_PURCHASES_FOR_WINNER: 3,
  MIN_DATA_BEFORE_PAUSE: 1500,
  // Intentionally omitted TARGET_CPA / TARGET_ROAS — use marketing_funnels
  MAX_DAILY_ACCOUNT_SPEND: 25000,
  MAX_BUDGET_INCREASE_PERCENT: 20,
  MAX_BUDGET_DECREASE_PERCENT: 50,
  MAX_SINGLE_ACTION_SPEND: 10000,
  MAX_SINGLE_TEST_SPEND: 5000,
  CREATIVE_FATIGUE_THRESHOLD: 2.5,
  MIN_DATA_WINDOW_DAYS: 3,
  currency: 'INR',
}

export const CREATIVE_ANGLES = [
  'pain_point',
  'outcome',
  'price_value',
  'curiosity',
  'objection_handling',
  'before_after',
  'simplicity',
  'urgency',
  'beginner_positioning',
  'transformation',
  'comparison',
  'social_proof',
] as const
