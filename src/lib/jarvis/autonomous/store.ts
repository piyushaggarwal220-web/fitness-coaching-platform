/**
 * Persist observation snapshots, attention items (deduped), morning briefs.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import type { AttentionItem, MorningBriefStructured, UnifiedObservation } from '@/lib/jarvis/autonomous/types'

export async function persistObservationSnapshot(
  obs: UnifiedObservation,
  cycleId?: string | null
): Promise<string | null> {
  try {
    const admin = createAdminClient()
    const { data, error } = await admin
      .from('jarvis_observation_snapshots')
      .insert({
        observed_at: obs.observed_at,
        timezone: obs.timezone,
        cycle_id: cycleId ?? null,
        health: obs.health,
        revenue: obs.revenue,
        marketing: obs.marketing,
        funnels: obs.funnels,
        instagram: obs.instagram,
        content: obs.content,
        video: obs.video,
        research: obs.research,
        systems: obs.systems,
        findings: obs.findings,
        opportunities: obs.opportunities,
        data_status: obs.data_status,
        metadata: { limitations: obs.limitations },
      })
      .select('id')
      .maybeSingle()
    if (error) return null
    return (data?.id as string) ?? null
  } catch {
    return null
  }
}

export async function upsertAttentionItems(
  items: AttentionItem[]
): Promise<{ created: number; updated: number }> {
  let created = 0
  let updated = 0
  const admin = createAdminClient()

  for (const item of items) {
    try {
      const { data: existing } = await admin
        .from('jarvis_attention_items')
        .select('id, occurrence_count, status')
        .eq('fingerprint', item.fingerprint)
        .in('status', ['open', 'investigating', 'awaiting_approval', 'snoozed'])
        .maybeSingle()

      if (existing?.id) {
        await admin
          .from('jarvis_attention_items')
          .update({
            occurrence_count: (existing.occurrence_count ?? 1) + 1,
            last_seen_at: new Date().toISOString(),
            observation: item.observation,
            evidence: item.evidence,
            severity: item.severity,
            diagnosis: item.diagnosis ?? {},
            updated_at: new Date().toISOString(),
          })
          .eq('id', existing.id)
        updated += 1
      } else {
        const { error } = await admin.from('jarvis_attention_items').insert({
          fingerprint: item.fingerprint,
          severity: item.severity,
          system: item.system,
          title: item.title,
          observation: item.observation,
          evidence: item.evidence,
          next_action: item.next_action,
          requires_approval: item.requires_approval,
          deadline_at: item.deadline_at ?? null,
          status: item.status,
          diagnosis: item.diagnosis ?? {},
          occurrence_count: 1,
          first_seen_at: new Date().toISOString(),
          last_seen_at: new Date().toISOString(),
        })
        if (!error) created += 1
      }
    } catch {
      /* migration may be pending */
    }
  }

  return { created, updated }
}

export async function listOpenAttention(limit = 30): Promise<AttentionItem[]> {
  try {
    const admin = createAdminClient()
    const { data } = await admin
      .from('jarvis_attention_items')
      .select('*')
      .in('status', ['open', 'investigating', 'awaiting_approval'])
      .order('last_seen_at', { ascending: false })
      .limit(limit)
    return (data ?? []).map((r) => ({
      fingerprint: r.fingerprint as string,
      severity: r.severity as AttentionItem['severity'],
      system: r.system as string,
      title: r.title as string,
      observation: r.observation as string,
      evidence: (r.evidence as string[]) ?? [],
      next_action: (r.next_action as string) ?? 'Review',
      requires_approval: Boolean(r.requires_approval),
      deadline_at: r.deadline_at as string | null,
      status: r.status as AttentionItem['status'],
      occurrence_count: r.occurrence_count as number,
      diagnosis: r.diagnosis as AttentionItem['diagnosis'],
    }))
  } catch {
    return []
  }
}

export async function persistMorningBrief(input: {
  briefDate: string
  text: string
  structured: MorningBriefStructured
  meaningful: boolean
  snapshotId?: string | null
}): Promise<void> {
  try {
    const admin = createAdminClient()
    await admin.from('jarvis_morning_briefs').upsert(
      {
        brief_date: input.briefDate,
        timezone: input.structured.timezone,
        text: input.text,
        structured: input.structured,
        meaningful: input.meaningful,
        snapshot_id: input.snapshotId ?? null,
      },
      { onConflict: 'brief_date' }
    )
  } catch {
    /* optional until migration */
  }
}

export async function getLatestMorningBrief(): Promise<{
  text: string
  structured: MorningBriefStructured
  brief_date: string
} | null> {
  try {
    const admin = createAdminClient()
    const { data } = await admin
      .from('jarvis_morning_briefs')
      .select('brief_date, text, structured')
      .order('brief_date', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (!data) return null
    return {
      brief_date: data.brief_date as string,
      text: data.text as string,
      structured: data.structured as MorningBriefStructured,
    }
  } catch {
    return null
  }
}

export async function notifyIfMeaningful(input: {
  fingerprint: string
  kind: string
  title: string
  body: string
  metadata?: Record<string, unknown>
}): Promise<{ notified: boolean }> {
  try {
    const admin = createAdminClient()
    // Deduplicate: skip if same fingerprint notified in last 12h
    const since = new Date(Date.now() - 12 * 3600_000).toISOString()
    const { data: recent } = await admin
      .from('jarvis_notifications')
      .select('id')
      .gte('created_at', since)
      .contains('metadata', { fingerprint: input.fingerprint })
      .limit(1)
    if (recent?.[0]) return { notified: false }

    await admin.from('jarvis_notifications').insert({
      kind: input.kind,
      title: input.title,
      body: input.body.slice(0, 800),
      link: '/admin/jarvis',
      metadata: { fingerprint: input.fingerprint, ...(input.metadata ?? {}) },
    })
    return { notified: true }
  } catch {
    return { notified: false }
  }
}
