/**
 * Phase 13 events API — admin only. No secrets. No execute endpoint.
 */

import { NextResponse } from 'next/server'
import { requireMarketingAdmin } from '@/lib/ai-marketing/auth'
import {
  getEventById,
  getEventHealth,
  listRecentEvents,
  summarizeEventsForBrief,
} from '@/lib/jarvis/events'
import { explainStoredEvent } from '@/lib/jarvis/events/explain'
import { ingestJarvisEvent } from '@/lib/jarvis/events/dispatcher'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const auth = await requireMarketingAdmin()
  if (!auth.ok) return auth.response

  const url = new URL(req.url)
  const id = url.searchParams.get('id')
  if (id) {
    const event = await getEventById(id)
    return NextResponse.json({ success: true, event, explain: explainStoredEvent(event) })
  }

  const [events, health] = await Promise.all([listRecentEvents(50), getEventHealth()])
  return NextResponse.json({
    success: true,
    health,
    summary_lines: summarizeEventsForBrief(events),
    events: events.map((e) => ({
      id: e.id,
      event_type: e.event_type,
      source: e.source,
      system: e.system,
      priority: e.priority,
      significance: e.significance,
      status: e.status,
      funnel_id: e.funnel_id,
      entity_id: e.entity_id,
      coalesced_count: e.coalesced_count,
      created_at: e.created_at,
      significance_reason: e.significance_reason,
    })),
  })
}

export async function POST(req: Request) {
  const auth = await requireMarketingAdmin()
  if (!auth.ok) return auth.response

  const body = (await req.json().catch(() => ({}))) as {
    action?: string
    event_type?: string
    payload?: Record<string, unknown>
    funnel_id?: string | null
  }

  if (body.action === 'replay') {
    if (!body.event_type) {
      return NextResponse.json({ success: false, error: 'event_type required' }, { status: 400 })
    }
    const result = await ingestJarvisEvent({
      event_type: body.event_type,
      source: 'USER',
      payload: body.payload ?? {},
      funnel_id: body.funnel_id ?? null,
      dry_run: true,
      replay: true,
    })
    return NextResponse.json({ success: true, mode: 'DRY_RUN', ...result })
  }

  return NextResponse.json({ success: false, error: 'unsupported_action' }, { status: 400 })
}
