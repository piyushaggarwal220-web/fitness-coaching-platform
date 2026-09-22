/**
 * Deterministic next-action engine — no LLM for state detection.
 */

import type { ContentNextAction, ContentOpsState } from '@/lib/jarvis/content-ops/types'

export type NextActionContext = {
  ops_state: ContentOpsState
  has_footage: boolean
  has_creative: boolean
  has_edl: boolean
  render_complete: boolean
  has_approved_caption: boolean
  scheduled_for: string | null
  published_media_id: string | null
  blocking_reason?: string | null
  measurement_status?: string | null
}

export type NextActionResult = {
  action: ContentNextAction
  label: string
  blocking_reason: string | null
}

const LABELS: Record<ContentNextAction, string> = {
  UPLOAD_FOOTAGE: 'Upload footage',
  GENERATE_CREATIVE: 'Generate creative',
  CREATE_EDIT: 'Create edit',
  RENDER: 'Render',
  REVIEW_VIDEO: 'Review video',
  APPLY_REVISION: 'Apply revision',
  APPROVE: 'Approve for publish',
  SCHEDULE: 'Schedule',
  WAITING_FOR_PUBLISH: 'Waiting for publish',
  COLLECT_PERFORMANCE: 'Collect performance',
  WAIT_MEASUREMENT_WINDOW: 'Wait for measurement window',
  NONE: 'No action needed',
  UNBLOCK: 'Resolve blocker',
  RETRY_PUBLISH: 'Retry publish',
  FIX_FAILED: 'Investigate failure',
}

export function computeNextAction(ctx: NextActionContext): NextActionResult {
  if (ctx.blocking_reason) {
    return {
      action: 'UNBLOCK',
      label: LABELS.UNBLOCK,
      blocking_reason: ctx.blocking_reason,
    }
  }

  const state = ctx.ops_state

  if (state === 'FAILED') {
    return { action: 'FIX_FAILED', label: LABELS.FIX_FAILED, blocking_reason: 'Content in FAILED state' }
  }
  if (state === 'CANCELLED' || state === 'ARCHIVED' || state === 'COMPLETED') {
    return { action: 'NONE', label: LABELS.NONE, blocking_reason: null }
  }
  if (state === 'REJECTED') {
    return { action: 'NONE', label: 'Rejected — recreate or archive', blocking_reason: null }
  }

  if (state === 'REVISION_REQUESTED') {
    return {
      action: 'APPLY_REVISION',
      label: LABELS.APPLY_REVISION,
      blocking_reason: 'Revision requested',
    }
  }

  if (state === 'MEASURING') {
    return {
      action: 'WAIT_MEASUREMENT_WINDOW',
      label: LABELS.WAIT_MEASUREMENT_WINDOW,
      blocking_reason: null,
    }
  }

  if (state === 'PUBLISHED') {
    return {
      action: 'COLLECT_PERFORMANCE',
      label: LABELS.COLLECT_PERFORMANCE,
      blocking_reason: null,
    }
  }

  if (state === 'PUBLISHING') {
    return {
      action: 'WAITING_FOR_PUBLISH',
      label: 'Publishing in progress',
      blocking_reason: null,
    }
  }

  if (state === 'SCHEDULED') {
    return {
      action: 'WAITING_FOR_PUBLISH',
      label: LABELS.WAITING_FOR_PUBLISH,
      blocking_reason: ctx.scheduled_for
        ? `Waiting for scheduled time (${ctx.scheduled_for})`
        : 'Scheduled without timestamp',
    }
  }

  if (state === 'APPROVED') {
    if (!ctx.render_complete) {
      return {
        action: 'RENDER',
        label: 'Render required before schedule',
        blocking_reason: 'Waiting for render',
      }
    }
    return { action: 'SCHEDULE', label: LABELS.SCHEDULE, blocking_reason: null }
  }

  if (state === 'REVIEW') {
    return { action: 'REVIEW_VIDEO', label: LABELS.REVIEW_VIDEO, blocking_reason: 'Waiting for review' }
  }

  if (state === 'EDITING') {
    if (!ctx.render_complete && ctx.has_edl) {
      return { action: 'RENDER', label: LABELS.RENDER, blocking_reason: 'Waiting for render' }
    }
    return { action: 'REVIEW_VIDEO', label: 'Finish edit → review', blocking_reason: null }
  }

  if (state === 'EDIT_READY') {
    if (!ctx.has_footage) {
      return {
        action: 'UPLOAD_FOOTAGE',
        label: LABELS.UPLOAD_FOOTAGE,
        blocking_reason: 'Waiting for footage',
      }
    }
    if (!ctx.has_edl) {
      return { action: 'CREATE_EDIT', label: LABELS.CREATE_EDIT, blocking_reason: null }
    }
    return { action: 'RENDER', label: LABELS.RENDER, blocking_reason: null }
  }

  if (state === 'CREATIVE_READY') {
    if (!ctx.has_footage) {
      return {
        action: 'UPLOAD_FOOTAGE',
        label: LABELS.UPLOAD_FOOTAGE,
        blocking_reason: 'Waiting for footage',
      }
    }
    return { action: 'CREATE_EDIT', label: LABELS.CREATE_EDIT, blocking_reason: null }
  }

  if (state === 'PLANNED') {
    if (!ctx.has_creative) {
      return { action: 'GENERATE_CREATIVE', label: LABELS.GENERATE_CREATIVE, blocking_reason: null }
    }
    return { action: 'CREATE_EDIT', label: LABELS.CREATE_EDIT, blocking_reason: null }
  }

  if (state === 'OPPORTUNITY' || state === 'IDEA') {
    if (!ctx.has_creative) {
      return { action: 'GENERATE_CREATIVE', label: LABELS.GENERATE_CREATIVE, blocking_reason: null }
    }
    return { action: 'GENERATE_CREATIVE', label: 'Plan content', blocking_reason: null }
  }

  return { action: 'NONE', label: LABELS.NONE, blocking_reason: null }
}

export function nextActionLabel(action: ContentNextAction): string {
  return LABELS[action] ?? action
}
