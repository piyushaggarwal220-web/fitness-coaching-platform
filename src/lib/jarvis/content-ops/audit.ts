/**
 * Content ops audit — every meaningful state transition.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import type { ContentOpsState } from '@/lib/jarvis/content-ops/types'

export async function recordContentOpsTransition(input: {
  contentId: string
  previousState: ContentOpsState | null
  newState: ContentOpsState
  reason?: string | null
  actor?: string | null
  metadata?: Record<string, unknown>
}): Promise<void> {
  try {
    const admin = createAdminClient()
    await admin.from('jarvis_content_ops_events').insert({
      content_id: input.contentId,
      previous_state: input.previousState,
      new_state: input.newState,
      reason: input.reason ?? null,
      actor: input.actor ?? 'jarvis',
      metadata: input.metadata ?? {},
    })
  } catch {
    /* table may not exist until migration — non-fatal for unit tests */
  }
}
