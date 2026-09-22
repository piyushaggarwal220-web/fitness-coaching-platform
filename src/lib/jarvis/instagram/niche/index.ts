/**
 * Phase 8 — Fitness Niche / Instagram Content Intelligence public API.
 */

export * from '@/lib/jarvis/instagram/niche/types'
export {
  FITNESS_NICHES,
  inferNiche,
  inferGeography,
  windowHoursFromLabel,
  windowLabel,
  geographySignalLabel,
} from '@/lib/jarvis/instagram/niche/segments'
export {
  parseMetric,
  classifyVirality,
  metricDisplay,
  assertNoFabricatedZero,
} from '@/lib/jarvis/instagram/niche/virality'
export {
  analyzeReelFromText,
  reelRefFromResearchHit,
  fingerprintUrl,
} from '@/lib/jarvis/instagram/niche/parse-research'
export {
  extractHookPatterns,
  extractTopicPatterns,
  extractRepetitionSignals,
  detectContentGaps,
  trendSignalsFromPatterns,
  containsCausalClaim,
} from '@/lib/jarvis/instagram/niche/patterns'
export {
  originalityFromTrend,
  originalityFromReel,
  forbidCopyLanguage,
} from '@/lib/jarvis/instagram/niche/originality'
export {
  generateOpportunities,
  matchTrendToTaste,
  matchTrendToFootage,
  matchTrendToBusiness,
} from '@/lib/jarvis/instagram/niche/opportunities'
export {
  findViralReels,
  researchNicheTrends,
  externalInstagramGraphCapability,
} from '@/lib/jarvis/instagram/niche/discovery'
export { analyzeCreator, compareCreators } from '@/lib/jarvis/instagram/niche/creators'
export {
  generateNicheOpportunities,
  handoffOpportunityToCreative,
  getNicheIntelligenceOverview,
} from '@/lib/jarvis/instagram/niche/engine'
export {
  saveViralReels,
  listViralReels,
  saveTrendReport,
  findCachedTrendReport,
  getLatestTrendReport,
  saveCreatorProfile,
  saveOpportunities,
  listOpportunities,
  listOwnRecentTopics,
  upsertWatchlist,
  listWatchlists,
} from '@/lib/jarvis/instagram/niche/store'
export { runNicheIntelligenceMaintenance } from '@/lib/jarvis/instagram/niche/maintenance'
