export * from '@/lib/jarvis/video/intelligence/types'
export {
  getVideoIntelligenceProvider,
  describeVideoIntelligenceConfig,
  StubVideoIntelligenceProvider,
  TestVideoIntelligenceProvider,
  classifyByHeuristic,
} from '@/lib/jarvis/video/intelligence/provider'
export {
  createVideoSession,
  listVideoSessions,
  getVideoSession,
  ingestSourceIntoSession,
  attachSourceToSession,
  refreshSessionAggregates,
  resolveSourceId,
} from '@/lib/jarvis/video/intelligence/sessions'
export {
  analyzeSource,
  analyzeSession,
  getPipelineProgress,
  processDueVideoIntelligence,
} from '@/lib/jarvis/video/intelligence/pipeline'
export { searchFootage, sessionSummary } from '@/lib/jarvis/video/intelligence/search'
export {
  buildOpportunitiesForSession,
  estimateReelCount,
  listOpportunities,
  opportunityFromUserIdea,
} from '@/lib/jarvis/video/intelligence/opportunities'
export { detectTakeGroups } from '@/lib/jarvis/video/intelligence/takes'
