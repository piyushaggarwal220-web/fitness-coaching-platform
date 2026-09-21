export { getMarketingOverview } from '@/lib/ai-marketing/overview'
export { syncMetaMarketingData } from '@/lib/ai-marketing/meta/sync'
export {
  executeMetaWrite,
  pushCreativeToMeta,
  prepareOrCreateMetaTest,
  canPushPausedMetaObjects,
} from '@/lib/ai-marketing/meta/writes'
export { getMetaIntegrationStatus, getMetaCredentials } from '@/lib/ai-marketing/meta/client'
export { generateCreativeConcepts } from '@/lib/ai-marketing/agents/creative'
export { runPerformanceAnalysis } from '@/lib/ai-marketing/agents/analytics'
export { generateUgcConcepts } from '@/lib/ai-marketing/agents/ugc'
export { generateInstagramIdeas } from '@/lib/ai-marketing/agents/instagram'
export { analyzeFunnel } from '@/lib/ai-marketing/agents/funnel'
export { runMarketingBrain, runDailyMarketingCycle } from '@/lib/ai-marketing/brain'
export { approveMarketingAction } from '@/lib/ai-marketing/decision-engine'
export { runGuardrails } from '@/lib/ai-marketing/guardrails'
export { evaluateAutonomyGate, liveMetaExecutionEnabled } from '@/lib/ai-marketing/autonomy'
export {
  listFunnels,
  getFunnelById,
  assignCampaignToFunnel,
  getPerformanceByFunnel,
} from '@/lib/ai-marketing/funnels'
export { buildDailyFunnelReport } from '@/lib/ai-marketing/reporting/daily-report'
export {
  classifyCreative,
  listCreativePerformance,
  refreshCreativePerformanceForFunnel,
} from '@/lib/ai-marketing/creative-performance'
export { buildBudgetRecommendations } from '@/lib/ai-marketing/budget-recommendations'
