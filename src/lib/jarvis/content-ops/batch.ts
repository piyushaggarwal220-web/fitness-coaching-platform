/**
 * Bounded content batch generation — plans first, never auto-renders dozens.
 */

import { createHash } from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { proposeContentSchedule } from '@/lib/jarvis/content-ops/schedule-proposal'
import { createContentOpsItem } from '@/lib/jarvis/content-ops/store'
import type { CadencePreset, ContentBatchProposal } from '@/lib/jarvis/content-ops/types'
import type { MixTargets } from '@/lib/jarvis/content-ops/mix'

const MAX_BATCH_ITEMS = 7

export async function proposeContentBatch(input: {
  cadence?: CadencePreset | number
  mix?: MixTargets
  days?: number
  contentGaps?: string[]
  trends?: string[]
  actorId?: string | null
}): Promise<{
  ok: boolean
  proposal: ContentBatchProposal
  note: string
}> {
  const admin = createAdminClient()
  const { data: queueRows } = await admin
    .from('marketing_content')
    .select('id, topic, reason, content_mix_pillar, content_type, ops_state')
    .eq('platform', 'instagram')
    .in('ops_state', ['IDEA', 'OPPORTUNITY', 'PLANNED', 'CREATIVE_READY', 'APPROVED'])
    .limit(20)

  let availableCompletedVideos = 0
  try {
    const { count } = await admin
      .from('video_edit_jobs')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'completed')
    availableCompletedVideos = count ?? 0
  } catch {
    availableCompletedVideos = 0
  }

  const proposal = await proposeContentSchedule({
    cadence: input.cadence ?? '3_per_week',
    mix: input.mix,
    days: input.days ?? 7,
    contentGaps: input.contentGaps,
    trends: input.trends,
    availableCompletedVideos,
    queueTitles: (queueRows ?? []).map((r) => ({
      id: r.id as string,
      title: (r.topic as string) || 'Untitled',
      pillar: r.content_mix_pillar as string | undefined,
      objective: r.reason as string | undefined,
      format: r.content_type as string | undefined,
    })),
  })

  // Bound
  proposal.items = proposal.items.slice(0, MAX_BATCH_ITEMS)

  try {
    await admin.from('jarvis_content_batch_proposals').upsert(
      {
        fingerprint: proposal.fingerprint,
        status: 'proposed',
        window_start: proposal.window_start,
        window_end: proposal.window_end,
        cadence: proposal.cadence,
        items: proposal.items,
        rationale: proposal.rationale,
        limitations: proposal.limitations,
        created_by: input.actorId ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'fingerprint' }
    )
  } catch {
    /* migration may be pending */
  }

  return {
    ok: true,
    proposal,
    note: `Proposed bounded batch of ${proposal.items.length} item(s). Not scheduled or rendered until approved. Does not predict virality.`,
  }
}

export async function executeApprovedBatch(input: {
  fingerprint: string
  actorId?: string | null
  createPlansOnly?: boolean
}): Promise<{
  ok: boolean
  created_content_ids: string[]
  note: string
  error?: string
}> {
  const admin = createAdminClient()
  const { data: row } = await admin
    .from('jarvis_content_batch_proposals')
    .select('*')
    .eq('fingerprint', input.fingerprint)
    .maybeSingle()

  if (!row) return { ok: false, created_content_ids: [], note: 'Batch not found', error: 'not_found' }
  if (row.status !== 'proposed' && row.status !== 'approved') {
    return {
      ok: false,
      created_content_ids: [],
      note: `Batch status ${row.status} — cannot execute`,
      error: 'invalid_status',
    }
  }

  const items = (row.items as ContentBatchProposal['items']) ?? []
  const created: string[] = []

  for (const item of items.slice(0, MAX_BATCH_ITEMS)) {
    if (item.content_id) {
      created.push(item.content_id)
      continue
    }
    const r = await createContentOpsItem({
      title: item.title,
      objective: item.objective,
      pillar: String(item.pillar),
      format: item.format,
      opsState: 'PLANNED',
      opportunityFingerprint: createHash('sha256')
        .update(`${input.fingerprint}:${item.title}`)
        .digest('hex')
        .slice(0, 16),
      metadata: {
        batch_fingerprint: input.fingerprint,
        proposed_date: item.date,
        proposed_time: item.time_local,
        basis: item.basis,
      },
      actorId: input.actorId,
    })
    if (r.content_id) created.push(r.content_id)
  }

  await admin
    .from('jarvis_content_batch_proposals')
    .update({
      status: 'executed',
      updated_at: new Date().toISOString(),
    })
    .eq('fingerprint', input.fingerprint)

  return {
    ok: true,
    created_content_ids: created,
    note: input.createPlansOnly !== false
      ? `Created ${created.length} planned content item(s). Creative/edit/render require separate steps and cost/autonomy gates.`
      : `Created ${created.length} item(s).`,
  }
}

/**
 * Convert a niche opportunity into a single queue item (bounded — never dozens).
 */
export async function opportunityToQueueItem(input: {
  title: string
  objective?: string
  pillar?: string
  fingerprint?: string
  researchRef?: string
  actorId?: string | null
}): Promise<{ ok: boolean; content_id?: string; note: string }> {
  const fp =
    input.fingerprint ||
    createHash('sha256').update(input.title).digest('hex').slice(0, 16)

  const admin = createAdminClient()
  const { data: existing } = await admin
    .from('marketing_content')
    .select('id')
    .eq('opportunity_fingerprint', fp)
    .maybeSingle()

  if (existing?.id) {
    return {
      ok: true,
      content_id: existing.id,
      note: 'Opportunity already in queue (fingerprint match).',
    }
  }

  const r = await createContentOpsItem({
    title: input.title,
    objective: input.objective ?? 'Inspired by observed niche pattern — original execution required',
    pillar: input.pillar ?? 'education',
    opsState: 'OPPORTUNITY',
    opportunityFingerprint: fp,
    metadata: {
      research_ref: input.researchRef ?? null,
      originality: 'topic_angle_only_no_copying',
    },
    actorId: input.actorId,
  })

  return {
    ok: r.ok,
    content_id: r.content_id,
    note: r.ok
      ? 'Created opportunity queue item. Not published. Does not claim virality.'
      : r.error ?? 'failed',
  }
}
