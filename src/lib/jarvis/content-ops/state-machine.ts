/**
 * Explicit content operations state machine.
 * Invalid transitions return an error — no silent jumps.
 */

import type { ContentOpsState, PipelineColumn } from '@/lib/jarvis/content-ops/types'

/** Allowed edges: from → to[] */
export const CONTENT_OPS_TRANSITIONS: Record<ContentOpsState, readonly ContentOpsState[]> = {
  IDEA: ['OPPORTUNITY', 'PLANNED', 'CANCELLED', 'ARCHIVED'],
  OPPORTUNITY: ['PLANNED', 'REJECTED', 'CANCELLED', 'ARCHIVED'],
  PLANNED: ['CREATIVE_READY', 'CANCELLED', 'ARCHIVED'],
  CREATIVE_READY: ['EDIT_READY', 'REVISION_REQUESTED', 'CANCELLED', 'ARCHIVED'],
  EDIT_READY: ['EDITING', 'CANCELLED', 'ARCHIVED'],
  EDITING: ['REVIEW', 'FAILED', 'CANCELLED'],
  REVIEW: ['REVISION_REQUESTED', 'APPROVED', 'REJECTED', 'CANCELLED'],
  REVISION_REQUESTED: ['EDITING', 'CREATIVE_READY', 'CANCELLED'],
  APPROVED: ['SCHEDULED', 'PUBLISHING', 'CANCELLED', 'ARCHIVED'],
  SCHEDULED: ['PUBLISHING', 'APPROVED', 'CANCELLED', 'FAILED'],
  PUBLISHING: ['PUBLISHED', 'FAILED', 'SCHEDULED'],
  PUBLISHED: ['MEASURING', 'COMPLETED', 'ARCHIVED'],
  MEASURING: ['COMPLETED', 'FAILED'],
  COMPLETED: ['ARCHIVED'],
  REJECTED: ['IDEA', 'OPPORTUNITY', 'ARCHIVED'],
  FAILED: ['EDIT_READY', 'APPROVED', 'SCHEDULED', 'CANCELLED', 'ARCHIVED'],
  CANCELLED: ['ARCHIVED', 'IDEA'],
  ARCHIVED: [],
}

export function canTransition(from: ContentOpsState, to: ContentOpsState): boolean {
  if (from === to) return true
  return (CONTENT_OPS_TRANSITIONS[from] ?? []).includes(to)
}

export function assertTransition(
  from: ContentOpsState,
  to: ContentOpsState
): { ok: true } | { ok: false; error: string } {
  if (canTransition(from, to)) return { ok: true }
  return {
    ok: false,
    error: `Invalid content ops transition: ${from} → ${to}`,
  }
}

export function isTerminalState(state: ContentOpsState): boolean {
  return state === 'COMPLETED' || state === 'ARCHIVED' || state === 'CANCELLED'
}

export function requiresApprovalForPublish(state: ContentOpsState): boolean {
  return state === 'APPROVED' || state === 'SCHEDULED' || state === 'PUBLISHING'
}

export function canSchedule(state: ContentOpsState): boolean {
  return state === 'APPROVED' || state === 'SCHEDULED'
}

export function canPublish(state: ContentOpsState): boolean {
  return state === 'APPROVED' || state === 'SCHEDULED' || state === 'PUBLISHING'
}

export function pipelineColumnForState(state: ContentOpsState): PipelineColumn | null {
  switch (state) {
    case 'IDEA':
    case 'OPPORTUNITY':
      return 'Ideas'
    case 'PLANNED':
      return 'Planning'
    case 'CREATIVE_READY':
      return 'Creative'
    case 'EDIT_READY':
    case 'EDITING':
      return 'Editing'
    case 'REVIEW':
    case 'REVISION_REQUESTED':
      return 'Review'
    case 'APPROVED':
      return 'Approved'
    case 'SCHEDULED':
    case 'PUBLISHING':
      return 'Scheduled'
    case 'PUBLISHED':
      return 'Published'
    case 'MEASURING':
    case 'COMPLETED':
      return 'Measuring'
    default:
      return null
  }
}

export function statesForPipelineColumn(column: PipelineColumn): ContentOpsState[] {
  switch (column) {
    case 'Ideas':
      return ['IDEA', 'OPPORTUNITY']
    case 'Planning':
      return ['PLANNED']
    case 'Creative':
      return ['CREATIVE_READY']
    case 'Editing':
      return ['EDIT_READY', 'EDITING']
    case 'Review':
      return ['REVIEW', 'REVISION_REQUESTED']
    case 'Approved':
      return ['APPROVED']
    case 'Scheduled':
      return ['SCHEDULED', 'PUBLISHING']
    case 'Published':
      return ['PUBLISHED']
    case 'Measuring':
      return ['MEASURING', 'COMPLETED']
    default:
      return []
  }
}

/** Map legacy marketing_content.status → ops_state when ops_state is null. */
export function legacyStatusToOpsState(status: string | null | undefined): ContentOpsState {
  switch ((status ?? '').toLowerCase()) {
    case 'idea':
      return 'IDEA'
    case 'draft':
      return 'PLANNED'
    case 'ready_for_edit':
      return 'EDIT_READY'
    case 'review':
      return 'REVIEW'
    case 'revision_requested':
      return 'REVISION_REQUESTED'
    case 'approved':
      return 'APPROVED'
    case 'scheduled':
      return 'SCHEDULED'
    case 'posted':
      return 'PUBLISHED'
    case 'rejected':
      return 'REJECTED'
    case 'archived':
      return 'ARCHIVED'
    default:
      return 'IDEA'
  }
}

export function opsStateToLegacyStatus(state: ContentOpsState): string {
  switch (state) {
    case 'IDEA':
    case 'OPPORTUNITY':
      return 'idea'
    case 'PLANNED':
    case 'CREATIVE_READY':
      return 'draft'
    case 'EDIT_READY':
    case 'EDITING':
      return 'ready_for_edit'
    case 'REVIEW':
      return 'review'
    case 'REVISION_REQUESTED':
      return 'revision_requested'
    case 'APPROVED':
      return 'approved'
    case 'SCHEDULED':
    case 'PUBLISHING':
      return 'scheduled'
    case 'PUBLISHED':
    case 'MEASURING':
    case 'COMPLETED':
      return 'posted'
    case 'REJECTED':
      return 'rejected'
    case 'FAILED':
      return 'draft'
    case 'CANCELLED':
    case 'ARCHIVED':
      return 'archived'
    default:
      return 'draft'
  }
}
