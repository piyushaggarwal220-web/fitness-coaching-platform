export { runJarvisTurn, getOrCreateConversation } from '@/lib/jarvis/core/orchestrator'
export { buildJarvisContext } from '@/lib/jarvis/core/context'
export { investigateBusinessQuestion } from '@/lib/jarvis/core/investigate'
export { runTool } from '@/lib/jarvis/core/action-runner'
export { ensureJarvisToolsRegistered } from '@/lib/jarvis/tools/builtins'
export { listTools, getTool, toolCatalogForPrompt } from '@/lib/jarvis/tools/registry'
export { evaluateToolPermission } from '@/lib/jarvis/permissions/risk-engine'
export {
  resolveApproval,
  listPendingApprovals,
  createApprovalRequest,
} from '@/lib/jarvis/permissions/approval-engine'
export { getCostDashboard, assertAiBudgetAvailable } from '@/lib/jarvis/cost/usage'
export { getJarvisBudgets, setJarvisSetting } from '@/lib/jarvis/cost/governor'
export { runJarvisBackgroundCycle } from '@/lib/jarvis/workers/background-cycle'
export { emitJarvisEvent, processPendingJarvisEvents } from '@/lib/jarvis/workers/events'
export { searchMemory, remember, listMemory, updateMemory, forgetMemory } from '@/lib/jarvis/memory/business-memory'
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
export { runDiagnostic, runSelfTest, selectModel } from '@/lib/jarvis/diagnostics'
export {
  METRIC_SOURCES,
  LURVOX_PRODUCT_REVENUE_METRIC,
  getMetricSource,
  requireVerifiedMetricSource,
  sourceAllowedForMetric,
  dataSourcesForQuestion,
  jarvisMetricOperatorNotes,
  SOURCE_OF_TRUTH_NOT_VERIFIED,
} from '@/lib/jarvis/metrics/source-of-truth'
export { loadLurvoxRevenue } from '@/lib/jarvis/metrics/lurvox-revenue'
export type { JarvisStreamEvent, JarvisApprovalCard, JarvisRiskClass } from '@/lib/jarvis/types'
