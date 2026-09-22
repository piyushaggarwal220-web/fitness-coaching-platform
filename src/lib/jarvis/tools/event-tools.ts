/**
 * Phase 13 event tools — read/explain/replay only. No events.execute.
 */

import { z } from 'zod'
import { registerTool } from '@/lib/jarvis/tools/registry'
import {
  getEventById,
  getEventHealth,
  listRecentEvents,
  summarizeEventsForBrief,
} from '@/lib/jarvis/events'
import { explainStoredEvent } from '@/lib/jarvis/events/explain'
import { ingestJarvisEvent } from '@/lib/jarvis/events/dispatcher'

let registered = false

export function registerEventTools(): void {
  if (registered) return
  registered = true

  registerTool({
    name: 'events.list',
    description: 'List recent Jarvis business events (normalized). READ.',
    riskClass: 'READ',
    estimatedCostUsd: 0.01,
    canRunAutonomously: true,
    timeoutMs: 15_000,
    tokenBudget: 800,
    auditRequired: false,
    inputSchema: z.object({
      limit: z.number().int().min(1).max(100).optional(),
      system: z.string().optional(),
      funnel_id: z.string().optional(),
    }),
    async execute(input) {
      let rows = await listRecentEvents(input.limit ?? 40)
      if (input.system) rows = rows.filter((r) => r.system === input.system)
      if (input.funnel_id) rows = rows.filter((r) => r.funnel_id === input.funnel_id)
      return {
        ok: true,
        count: rows.length,
        events: rows.map((r) => ({
          id: r.id,
          event_type: r.event_type,
          system: r.system,
          priority: r.priority,
          significance: r.significance,
          status: r.status,
          funnel_id: r.funnel_id,
          coalesced_count: r.coalesced_count,
          created_at: r.created_at,
        })),
      }
    },
  })

  registerTool({
    name: 'events.get',
    description: 'Get one Jarvis event by id. READ.',
    riskClass: 'READ',
    estimatedCostUsd: 0.01,
    canRunAutonomously: true,
    timeoutMs: 10_000,
    tokenBudget: 600,
    auditRequired: false,
    inputSchema: z.object({ event_id: z.string().uuid() }),
    async execute(input) {
      const event = await getEventById(input.event_id)
      return event ? { ok: true, event } : { ok: false, error: 'not_found' }
    },
  })

  registerTool({
    name: 'events.explain',
    description: 'Explain why an event mattered using structured records only.',
    riskClass: 'READ',
    estimatedCostUsd: 0.01,
    canRunAutonomously: true,
    timeoutMs: 10_000,
    tokenBudget: 800,
    auditRequired: false,
    inputSchema: z.object({ event_id: z.string().uuid() }),
    async execute(input) {
      const event = await getEventById(input.event_id)
      return explainStoredEvent(event)
    },
  })

  registerTool({
    name: 'events.summary',
    description: 'Summarize recent significant events for briefings.',
    riskClass: 'READ',
    estimatedCostUsd: 0.01,
    canRunAutonomously: true,
    timeoutMs: 10_000,
    tokenBudget: 600,
    auditRequired: false,
    inputSchema: z.object({ limit: z.number().int().min(1).max(50).optional() }),
    async execute(input) {
      const rows = await listRecentEvents(input.limit ?? 30)
      return { ok: true, lines: summarizeEventsForBrief(rows), count: rows.length }
    },
  })

  registerTool({
    name: 'events.health',
    description: 'Event queue health: depth, failures, oldest unprocessed.',
    riskClass: 'READ',
    estimatedCostUsd: 0.01,
    canRunAutonomously: true,
    timeoutMs: 10_000,
    tokenBudget: 400,
    auditRequired: false,
    inputSchema: z.object({}),
    async execute() {
      return { ok: true, ...(await getEventHealth()) }
    },
  })

  registerTool({
    name: 'events.unresolved',
    description: 'List unresolved queued/deferred events.',
    riskClass: 'READ',
    estimatedCostUsd: 0.01,
    canRunAutonomously: true,
    timeoutMs: 10_000,
    tokenBudget: 600,
    auditRequired: false,
    inputSchema: z.object({ limit: z.number().int().min(1).max(50).optional() }),
    async execute(input) {
      const rows = await listRecentEvents(input.limit ?? 40)
      const open = rows.filter((r) =>
        ['pending', 'QUEUED', 'RECEIVED', 'DEFERRED', 'PROCESSING'].includes(r.status)
      )
      return { ok: true, count: open.length, events: open }
    },
  })

  registerTool({
    name: 'events.replay',
    description:
      'Safe replay: re-ingest with dry_run=true. Never performs live external writes.',
    riskClass: 'LOW_RISK',
    estimatedCostUsd: 0.02,
    canRunAutonomously: false,
    timeoutMs: 20_000,
    tokenBudget: 500,
    auditRequired: true,
    inputSchema: z.object({
      event_type: z.string(),
      payload: z.record(z.string(), z.unknown()).optional(),
      funnel_id: z.string().nullable().optional(),
    }),
    async execute(input) {
      const result = await ingestJarvisEvent({
        event_type: input.event_type,
        source: 'USER',
        payload: input.payload ?? {},
        funnel_id: input.funnel_id ?? null,
        dry_run: true,
        replay: true,
      })
      return { mode: 'DRY_RUN', ...result }
    },
  })
}
