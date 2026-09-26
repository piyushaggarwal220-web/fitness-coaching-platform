/**
 * Event ingest + process — triggers only; actions via runTool (Phase 12).
 */

import { eventIngestSchema } from '@/lib/jarvis/events/schema'
import { normalizeJarvisEvent } from '@/lib/jarvis/events/normalize'
import { classifyAgainstRecent } from '@/lib/jarvis/events/dedupe'
import { evaluateSignificance } from '@/lib/jarvis/events/significance'
import { shouldStormDefer } from '@/lib/jarvis/events/storm'
import {
  bumpCoalescedCount,
  claimQueuedEvents,
  countEventsSince,
  countInvestigationsSince,
  insertCanonicalEvent,
  listRecentByFingerprint,
  listRecentEvents,
  updateEventStatus,
  type StoredJarvisEvent,
} from '@/lib/jarvis/events/store'
import { cooldownKeyFor, isCooldownActive, setCooldown } from '@/lib/jarvis/events/cooldowns'
import { getEventDefinition } from '@/lib/jarvis/events/registry'
import { dispatchEventAction } from '@/lib/jarvis/events/handlers'
import { writeMarketingAudit } from '@/lib/ai-marketing/audit'
import { getJarvisBudgets } from '@/lib/jarvis/cost/governor'
import type { EventIngestInput, SignificanceResult } from '@/lib/jarvis/events/types'

export type IngestResult = {
  ok: boolean
  event_id: string | null
  status: string
  significance?: SignificanceResult
  dedupe_class?: string
  reason?: string
  error?: string
}

export async function ingestJarvisEvent(raw: EventIngestInput): Promise<IngestResult> {
  const parsed = eventIngestSchema.safeParse(raw)
  if (!parsed.success) {
    return {
      ok: false,
      event_id: null,
      status: 'FAILED',
      error: parsed.error.issues.map((i) => i.message).join('; '),
    }
  }

  const dryRun = Boolean(parsed.data.dry_run || parsed.data.replay)
  const canonical = normalizeJarvisEvent({
    ...parsed.data,
    dry_run: dryRun,
    replay: Boolean(parsed.data.replay),
  })

  const def = getEventDefinition(canonical.event_type)
  const since = new Date(Date.now() - def.dedupe_window_seconds * 1000).toISOString()
  const recentFp = await listRecentByFingerprint(canonical.fingerprint, since)
  const recentAll = (await listRecentEvents(30)).map((r) => ({
    id: r.id,
    fingerprint: r.fingerprint || '',
    event_type: r.event_type,
    entity_id: r.entity_id,
    funnel_id: r.funnel_id,
    created_at: r.created_at,
    status: r.status,
    coalesced_count: r.coalesced_count,
  }))

  const dedupe = classifyAgainstRecent(canonical, recentAll)
  if (!dedupe.keep && dedupe.coalesce_into_id) {
    if (dedupe.class === 'COALESCED' && dedupe.coalesced_count) {
      await bumpCoalescedCount(dedupe.coalesce_into_id, dedupe.coalesced_count)
    }
    const dup = await insertCanonicalEvent(canonical, 'DUPLICATE', {
      action: 'IGNORE',
      priority: 'P4',
      reason: dedupe.reason,
      magnitude: null,
      relative_change: null,
      confidence: 'HIGH',
      baseline: null,
    })
    if (dup) {
      await updateEventStatus(dup.id, {
        status: 'DUPLICATE',
        parent_event_id: dedupe.coalesce_into_id,
        processed_at: new Date().toISOString(),
        result: { dedupe: dedupe.class, parent: dedupe.coalesce_into_id },
      })
    }
    return {
      ok: true,
      event_id: dup?.id ?? dedupe.coalesce_into_id,
      status: 'DUPLICATE',
      dedupe_class: dedupe.class,
      reason: dedupe.reason,
    }
  }

  const minuteAgo = new Date(Date.now() - 60_000).toISOString()
  const hourAgo = new Date(Date.now() - 3600_000).toISOString()
  const [eventsLastMinute, eventsLastHour, investigationsLastHour] = await Promise.all([
    countEventsSince(minuteAgo),
    countEventsSince(hourAgo),
    countInvestigationsSince(hourAgo),
  ])

  const cdKey = cooldownKeyFor(canonical.event_type, canonical.entity_id, canonical.funnel_id)
  const cooldownActive = await isCooldownActive(cdKey)
  const storm = shouldStormDefer({
    eventsLastMinute,
    eventsLastHour,
    investigationsLastHour,
    priority: canonical.priority,
  })

  const significance = evaluateSignificance(canonical, {
    recentDuplicate: Boolean(recentFp.find((r) => r.status === 'PROCESSING')),
    cooldownActive,
    stormDefer: storm.defer,
  })

  canonical.priority = significance.priority

  const status =
    significance.action === 'IGNORE'
      ? 'IGNORED'
      : dryRun
        ? 'QUEUED'
        : 'QUEUED'

  const stored = await insertCanonicalEvent(canonical, status, significance)
  if (!stored) {
    return { ok: false, event_id: null, status: 'FAILED', error: 'persist_failed' }
  }

  await writeMarketingAudit({
    agent: 'jarvis',
    decision: 'event_ingested',
    action: canonical.event_type,
    reasoning: significance.reason,
    execution_result: {
      event_id: stored.id,
      significance: significance.action,
      fingerprint: canonical.fingerprint,
      dry_run: dryRun,
    },
  })

  if (significance.action === 'IGNORE') {
    await updateEventStatus(stored.id, {
      status: 'IGNORED',
      processed_at: new Date().toISOString(),
      result: { significance },
    })
  }

  return {
    ok: true,
    event_id: stored.id,
    status: stored.status,
    significance,
    dedupe_class: 'UNIQUE',
    reason: significance.reason,
  }
}

/**
 * Process queue — investigations via runTool only (Phase 12).
 */
export async function processJarvisEventQueue(limit = 10): Promise<{
  processed: number
  results: Record<string, unknown>[]
}> {
  const budgets = await getJarvisBudgets()
  if (!budgets.background_enabled) return { processed: 0, results: [] }

  const claimed = await claimQueuedEvents(limit)
  const results: Record<string, unknown>[] = []
  let processed = 0

  for (const ev of claimed) {
    try {
      const outcome = await dispatchEventAction(ev)
      await updateEventStatus(ev.id, {
        status: outcome.status,
        result: outcome.result,
        error: outcome.error ?? null,
        processed_at: new Date().toISOString(),
      })
      if (outcome.set_cooldown) {
        await setCooldown({
          cooldownKey: cooldownKeyFor(ev.event_type, ev.entity_id, ev.funnel_id),
          eventType: ev.event_type,
          fingerprint: ev.fingerprint,
        })
      }
      processed += 1
      results.push({ id: ev.id, ...outcome.result, status: outcome.status })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Event processing failed'
      await updateEventStatus(ev.id, {
        status: 'FAILED',
        error: message,
        processed_at: new Date().toISOString(),
      })
      results.push({ id: ev.id, error: message })
    }
  }

  return { processed, results }
}

export function summarizeEventsForBrief(events: StoredJarvisEvent[]): string[] {
  return events
    .filter((e) => ['INVESTIGATE', 'ALERT', 'URGENT', 'DIGEST'].includes(String(e.significance)))
    .slice(0, 8)
    .map((e) => {
      const sig = e.significance || 'LOG'
      return `${e.event_type} [${sig}]${e.funnel_id ? ` funnel=${e.funnel_id}` : ''}${
        e.coalesced_count > 1 ? ` ×${e.coalesced_count}` : ''
      }`
    })
}
