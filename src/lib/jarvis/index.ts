export { runJarvisTurn, getOrCreateConversation } from '@/lib/jarvis/core/orchestrator'
export { buildJarvisContext } from '@/lib/jarvis/core/context'
export { buildBusinessContextEngine } from '@/lib/jarvis/core/business-context'
export { investigateBusinessQuestion } from '@/lib/jarvis/core/investigate'
export {
  buildDurablePlanFromToolCalls,
  persistTaskPlan,
  updatePlanStep,
} from '@/lib/jarvis/core/durable-plan'
export { verifyAfterWrite, formatVerificationForOperator } from '@/lib/jarvis/core/verify-after-write'
export { runTool } from '@/lib/jarvis/core/action-runner'
export { ensureJarvisToolsRegistered } from '@/lib/jarvis/tools/builtins'
export {
  listTools,
  getTool,
  toolCatalogForPrompt,
} from '@/lib/jarvis/tools/registry'
export {
  boundedToolCatalogForPrompt,
  selectToolFamiliesForObjective,
} from '@/lib/jarvis/tools/selection'
export { evaluateToolPermission } from '@/lib/jarvis/permissions/risk-engine'
export {
  resolveApproval,
  listPendingApprovals,
  createApprovalRequest,
} from '@/lib/jarvis/permissions/approval-engine'
export { buildApprovalBriefing } from '@/lib/jarvis/permissions/approval-briefing'
export { getCostDashboard, assertAiBudgetAvailable } from '@/lib/jarvis/cost/usage'
export { getJarvisBudgets, setJarvisSetting } from '@/lib/jarvis/cost/governor'
export { runJarvisBackgroundCycle } from '@/lib/jarvis/workers/background-cycle'
export { detectProactiveFindings } from '@/lib/jarvis/workers/proactive'
export { emitJarvisEvent, processPendingJarvisEvents } from '@/lib/jarvis/workers/events'
export {
  searchMemory,
  remember,
  listMemory,
  updateMemory,
  forgetMemory,
} from '@/lib/jarvis/memory/business-memory'
export {
  recordOutcome,
  learnFromChatTurn,
  listRecentLearnings,
  recordDecision,
  linkActionToDecision,
  scheduleOutcomeCheck,
  measureOutcome,
  processDueOutcomeMeasurements,
  getLearningCenterData,
  answerLearningQuery,
  runLearningMaintenance,
  recordDecisionActionAndSchedule,
} from '@/lib/jarvis/memory/learning-loop'
export { compareMetric, classifyOutcome } from '@/lib/jarvis/memory/comparison'
export {
  retrieveRelevantMemory,
  detectMemoryConflicts,
  planningHintsFromMemory,
} from '@/lib/jarvis/memory/retrieval'
export { validateMemoryWrite, categoryForKind, canonicalizeKind } from '@/lib/jarvis/memory/kinds'
export { buildBusinessSystemRegistry } from '@/lib/jarvis/operator/systems/registry'
export { buildBusinessOperatorSnapshot } from '@/lib/jarvis/operator/snapshot'
export {
  matchInvestigationPattern,
  runInvestigationPattern,
  INVESTIGATION_PATTERNS,
} from '@/lib/jarvis/operator/investigations/patterns'
export { buildOperatorPlanForIntent } from '@/lib/jarvis/operator/planner'
export {
  lurvoxRevenueOperator,
  funnelOperator,
  metaAdsOperator,
  instagramOperator,
  shopifyOperator,
  creativeOperator,
  videoOperator,
  researchOperator,
} from '@/lib/jarvis/operator/facades'
export { humanizeJarvisError } from '@/lib/jarvis/operator-errors'
export { buildBusinessPulse } from '@/lib/jarvis/operator-pulse'
export { presentCockpit } from '@/lib/jarvis/operator-cockpit'
export { buildOperatorSystem, listIntegrationCards } from '@/lib/jarvis/operator-integrations'
export { buildActivityFeed } from '@/lib/jarvis/operator-activity'
export { runObjectiveResearch } from '@/lib/jarvis/research/research-agent'
export { isBraveSearchConfigured, braveWebSearch } from '@/lib/jarvis/research/brave-search'
export {
  isShopifyConfigured,
  getShopifyCredentials,
  shopifyTestConnection,
} from '@/lib/jarvis/shopify/client'
export {
  isInstagramConfigured,
  getInstagramCredentials,
  liveInstagramPublishingEnabled,
  instagramStatus,
} from '@/lib/jarvis/instagram'
export { runDiagnostic, runSelfTest, selectModel } from '@/lib/jarvis/diagnostics'
export {
  METRIC_SOURCES,
  LURVOX_PRODUCT_REVENUE_METRIC,
  INSTAGRAM_ORGANIC_ENGAGEMENT_METRIC,
  getMetricSource,
  requireVerifiedMetricSource,
  sourceAllowedForMetric,
  dataSourcesForQuestion,
  jarvisMetricOperatorNotes,
  SOURCE_OF_TRUTH_NOT_VERIFIED,
} from '@/lib/jarvis/metrics/source-of-truth'
export {
  getVideoIntelligenceProvider,
  describeVideoIntelligenceConfig,
  createVideoSession,
  listVideoSessions,
  analyzeSession,
  searchFootage,
  sessionSummary,
} from '@/lib/jarvis/video/intelligence'
export {
  planFromSession,
  planFromIdea,
  planCreativeBatch,
  reviseCreative,
  listCreativePlans,
} from '@/lib/jarvis/creative'
export {
  createAndPersistEdl,
  renderEdl,
  reviseEdl,
  validateEdl,
  listEdls,
} from '@/lib/jarvis/video/editor'
export {
  getTasteProfile,
  retrieveTaste,
  parseTasteFeedback,
  runTasteMaintenance,
} from '@/lib/jarvis/taste'
export {
  getContentQueue,
  getContentOpsSummary,
  canTransition,
  computeNextAction,
  proposeContentSchedule,
  evaluatePublishGates,
  buildDailyContentBrief,
  runContentOpsMaintenance,
} from '@/lib/jarvis/content-ops'
export {
  buildUnifiedObservation,
  runAutonomousOperatorCycle,
  buildAwaySummary,
  buildMorningBrief,
  listOpenAttention,
  explainWhyTelling,
} from '@/lib/jarvis/autonomous'
export {
  describeRealtimeCapability,
  realtimeEnabled,
  createRealtimeSession,
  processRealtimeTurn,
  processRealtimeAudio,
  interruptRealtimeSpeech,
} from '@/lib/jarvis/realtime'
export {
  evaluateExecutionPolicy,
  resolveAndEvaluatePolicy,
  getExecutionConfig,
  runExecutionGate,
  listRecentReceipts,
  explainExecutionDecision,
  executionKillSwitchActive,
} from '@/lib/jarvis/execution'
export {
  ingestJarvisEvent,
  processJarvisEventQueue,
  listRecentEvents,
  getEventHealth,
  explainStoredEvent,
  evaluateSignificance,
  normalizeJarvisEvent,
} from '@/lib/jarvis/events'
export {
  searchStrategicMemory,
  buildBusinessKnowledgeSnapshot,
  runStrategicReview,
  explainMemory,
  getStrategicMemoryHealth,
} from '@/lib/jarvis/memory/strategic'
export { loadLurvoxRevenue } from '@/lib/jarvis/metrics/lurvox-revenue'
export type { JarvisStreamEvent, JarvisApprovalCard, JarvisRiskClass } from '@/lib/jarvis/types'
