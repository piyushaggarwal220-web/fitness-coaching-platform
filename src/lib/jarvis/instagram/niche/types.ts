/**
 * Phase 8 Fitness Niche Intelligence — types.
 * WEB_RESEARCH ≠ INSTAGRAM_GRAPH_API. Metrics UNAVAILABLE ≠ 0.
 */

export type GeographyScope = 'INDIA' | 'GLOBAL' | 'OTHER_REGION' | 'UNKNOWN'

export type FitnessNiche =
  | 'GENERAL_FITNESS'
  | 'FAT_LOSS'
  | 'MUSCLE_GAIN'
  | 'BODYBUILDING'
  | 'NATURAL_BODYBUILDING'
  | 'BEGINNER_FITNESS'
  | 'NUTRITION'
  | 'CARDIO'
  | 'HOME_FITNESS'
  | 'GYM_TRAINING'
  | 'TRANSFORMATION'
  | 'ATHLETIC_PERFORMANCE'
  | 'FITNESS_MYTHS'
  | 'SUPPLEMENTS'

export type DiscoveryMethod =
  | 'WEB_RESEARCH'
  | 'INSTAGRAM_GRAPH_API'
  | 'USER_PROVIDED'
  | 'WATCHLIST'
  | 'CACHE'

export type ViralityBasis =
  | 'CREATOR_RELATIVE'
  | 'ABSOLUTE_REACH'
  | 'RECENT_ACCELERATION'
  | 'ENGAGEMENT'
  | 'MULTI_SOURCE_TREND'
  | 'INSUFFICIENT_DENOMINATOR'

export type MetricValue = number | 'UNAVAILABLE'

export type ObservationWindowHours = 24 | 168 | 720 | 2160 // 24h, 7d, 30d, 90d

export type TrendState = 'EMERGING' | 'GROWING' | 'ESTABLISHED' | 'DECLINING' | 'UNCERTAIN'

export type ClaimKind = 'OBSERVED' | 'INFERRED' | 'RECOMMENDATION'

export type SourceType =
  | 'PRIMARY'
  | 'PLATFORM'
  | 'CREATOR'
  | 'NEWS'
  | 'RESEARCH'
  | 'COMMUNITY'
  | 'SECONDARY'

export type ViralReelRef = {
  id?: string | null
  fingerprint: string
  creator_handle: string | null
  creator_profile_url: string | null
  source_url: string
  content_url: string | null
  title: string | null
  caption: string | null
  published_at: string | null
  observed_views: MetricValue
  observed_likes: MetricValue
  observed_comments: MetricValue
  content_type: string
  topic: string | null
  hook: string | null
  format: string | null
  duration_sec: number | null
  niche: FitnessNiche | string | null
  geography: GeographyScope
  discovery_method: DiscoveryMethod
  virality_basis: ViralityBasis[]
  confidence: number
  limitations: string[]
  analysis: ReelAnalysis
  tags: string[]
  observation_window: string | null
  source_name: string | null
  source_type: SourceType
  retrieved_at: string
}

export type ReelAnalysis = {
  hook: string | null
  topic: string | null
  angle: string | null
  format: string | null
  length_note: string | null
  opening_structure: string | null
  pacing: string | null
  caption_style: string | null
  text_overlays: string | null
  cta: string | null
  content_pillar: string | null
  emotional_frame: string | null
  educational_value: string | null
  story_structure: string | null
  visual_structure: string | null
  evidence_notes: string[]
  unsupported_claims: string[]
}

export type ObservedPattern = {
  kind: 'OBSERVED_PATTERN'
  label: string
  count: number
  sample_size: number
  statement: string
  window: string
  geography: GeographyScope
}

export type CreatorProfile = {
  id?: string | null
  fingerprint: string
  handle: string
  profile_url: string | null
  platform: string
  niche: string | null
  geography: GeographyScope
  follower_count: MetricValue
  observed_posting_frequency: string | null
  recent_content_count: number | null
  content_pillars: string[]
  formats: string[]
  recurring_hooks: string[]
  cta_patterns: string[]
  visible_engagement: MetricValue | string
  notable_patterns: string[]
  sample_size: number
  observation_window: string
  data_available: string[]
  data_unavailable: string[]
  limitations: string[]
  discovery_method: DiscoveryMethod
  retrieved_at: string
}

export type TrendReport = {
  id?: string | null
  fingerprint: string
  scope: string
  geography: GeographyScope
  niche: FitnessNiche | string
  observation_window: string
  window_hours: number
  creators_analyzed: number
  reels_analyzed: number
  top_topics: ObservedPattern[]
  hook_patterns: ObservedPattern[]
  format_patterns: ObservedPattern[]
  content_gaps: ContentGapSignal[]
  repetition_signals: RepetitionSignal[]
  emerging_signals: TrendSignal[]
  uncertain_signals: TrendSignal[]
  sources: ResearchSourceMeta[]
  opportunities: string[]
  claim_kind: 'OBSERVED_PATTERN' | 'INFERENCE' | 'RECOMMENDATION'
  discovery_method: DiscoveryMethod
  limitations: string[]
  spent_usd: number
  status: string
  created_at?: string
}

export type TrendSignal = {
  label: string
  state: TrendState
  basis: string
  window: string
  sample_size: number
  geography: GeographyScope
  signal_kind: 'INDIA_SIGNAL' | 'GLOBAL_SIGNAL' | 'MIXED_LABELED'
}

export type ContentGapSignal = {
  kind: 'CONTENT_GAP_SIGNAL'
  topic: string
  external_sample_count: number
  own_account_window_days: number
  own_recent_coverage: number
  evidence: string[]
  statement: string
}

export type RepetitionSignal = {
  kind: 'FORMAT_REPETITION_SIGNAL' | 'HOOK_SATURATION_SIGNAL'
  pattern: string
  count: number
  sample_size: number
  statement: string
}

export type ResearchSourceMeta = {
  source_url: string
  source_name: string
  published_at: string | null
  retrieved_at: string
  source_type: SourceType
  confidence: number
  discovery_method: DiscoveryMethod
}

export type OriginalAngle = {
  trend: string
  observed: string
  angles: string[]
  note: string
}

export type ContentOpportunity = {
  id?: string | null
  fingerprint: string
  title: string
  observed: string[]
  audience_signal: string[]
  taste_notes: string[]
  footage_notes: string[]
  missing_footage: string[]
  business_alignment: string | null
  trend_relevance: string | null
  originality_angles: string[]
  fit_level: 'HIGH_FIT' | 'MEDIUM_FIT' | 'LOW_FIT'
  scoring: {
    BUSINESS_ALIGNMENT: number
    FOOTAGE_AVAILABLE: number
    AUDIENCE_SIGNAL: number
    TREND_RELEVANCE: number
    TASTE_ALIGNMENT: number
    ORIGINALITY: number
    EFFORT: number
  }
  limitations: string[]
  geography: GeographyScope | null
  niche: string | null
  claim_separation: {
    OBSERVED: string[]
    INFERRED: string[]
    RECOMMENDATION: string[]
  }
  status: string
}

export type Watchlist = {
  id?: string | null
  name: string
  creators: string[]
  niches: string[]
  topics: string[]
  keywords: string[]
  geographies: string[]
  active: boolean
}

export const VIRALITY_GUARANTEE_FORBIDDEN =
  /\b(will go viral|guaranteed to (go )?viral|this will go viral|predict(?:s|ed)? virality)\b/i
