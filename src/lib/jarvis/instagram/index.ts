export {
  getInstagramCredentials,
  isInstagramConfigured,
  liveInstagramPublishingEnabled,
  resolveInstagramCredentials,
  readInstagramAccessToken,
  readInstagramBusinessAccountId,
} from '@/lib/jarvis/instagram/credentials'

export { createInstagramGraphClient } from '@/lib/jarvis/instagram/client'
export type { InstagramGraphClient, InstagramGraphCredentials } from '@/lib/jarvis/instagram/client'

export {
  instagramStatus,
  getInstagramProfile,
  listInstagramMedia,
  getInstagramMedia,
  getInstagramMediaInsights,
  followersFromProfileEnvelope,
} from '@/lib/jarvis/instagram/provider'
export type { InstagramProviderOptions, InstagramTransport } from '@/lib/jarvis/instagram/provider'

export {
  listLocalInstagramContent,
  getLocalInstagramContentById,
  saveInstagramContentPlan,
  saveInstagramDraft,
  updateInstagramDraft,
  localEngagementScore,
} from '@/lib/jarvis/instagram/content-store'

export {
  planInstagramContent,
  normalizeContentPlan,
  detectContentDuplicates,
} from '@/lib/jarvis/instagram/planner'

export { generateInstagramDraft } from '@/lib/jarvis/instagram/draft'
export type { InstagramVideoDraft } from '@/lib/jarvis/instagram/draft'

export {
  analyzeInstagramContent,
  localContentPerformance,
  localPostingFrequency,
  localEngagementSummary,
} from '@/lib/jarvis/instagram/analysis'

export {
  syncInstagramContent,
  syncInstagramContentForTests,
  INSTAGRAM_SYNC_DEFAULT_MEDIA_LIMIT,
  INSTAGRAM_SYNC_MAX_MEDIA_LIMIT,
  INSTAGRAM_SYNC_MAX_API_CALLS,
} from '@/lib/jarvis/instagram/sync'

export {
  analyzeInstagramPerformance,
  calculatePerformanceFromSnapshots,
  getInstagramIntelligenceSummary,
} from '@/lib/jarvis/instagram/intelligence'

export {
  createMemorySnapshotStore,
  normalizeMetricForPersist,
} from '@/lib/jarvis/instagram/snapshots'

export {
  prepareInstagramPublish,
  executeInstagramPublish,
  executeInstagramDelete,
  resolvePublishMediaAsset,
  blockedInstagramAccountSettings,
  blockedInstagramCredentialChanges,
} from '@/lib/jarvis/instagram/publish'

export { researchInstagramTrends, instagramBudgetExhaustedResult } from '@/lib/jarvis/instagram/research'

export * from '@/lib/jarvis/instagram/niche'

export {
  writeInstagramAudit,
  getInstagramAuditSinkForTests,
  resetInstagramAuditSinkForTests,
} from '@/lib/jarvis/instagram/audit'
