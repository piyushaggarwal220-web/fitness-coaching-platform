/**
 * Phase 6 AI Video Editor — public API.
 * EDL is canonical. Shotstack is execution only.
 */

export * from '@/lib/jarvis/video/editor/types'
export { planEdlFromHandoffSync, createEdlFromCreative } from '@/lib/jarvis/video/editor/planner'
export { validateEdl } from '@/lib/jarvis/video/editor/validator'
export { buildCaptions, captionsFromTranscriptSegments } from '@/lib/jarvis/video/editor/captions'
export { buildOverlays } from '@/lib/jarvis/video/editor/overlays'
export { centerCropReframe, smartFaceReframeCapability } from '@/lib/jarvis/video/editor/reframe'
export { defaultEdlAudio } from '@/lib/jarvis/video/editor/audio'
export { estimateEdlRenderCostUsd, gateEdlRenderBudget } from '@/lib/jarvis/video/editor/cost'
export {
  translateEdlToShotstack,
  shotstackTranslateMetadata,
} from '@/lib/jarvis/video/editor/providers/shotstack-translator'
export {
  saveEdl,
  loadEdl,
  listEdls,
  updateEdlStatus,
  appendEdlFeedback,
} from '@/lib/jarvis/video/editor/store'
export { createAndPersistEdl, renderEdl, markEdlRenderedFromJob } from '@/lib/jarvis/video/editor/render'
export { reviseEdl, applyEdlPatch, parseRevisionFeedback } from '@/lib/jarvis/video/editor/revision'
export { diffEdls } from '@/lib/jarvis/video/editor/diff'
