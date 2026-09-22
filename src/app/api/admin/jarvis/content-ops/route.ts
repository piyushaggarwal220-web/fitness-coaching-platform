import { NextResponse } from 'next/server'
import { requireMarketingAdmin } from '@/lib/ai-marketing/auth'
import { liveInstagramPublishingEnabled } from '@/lib/jarvis/instagram'
import {
  getContentQueue,
  getContentOpsSummary,
  buildDailyContentBrief,
  formatDailyBriefText,
  listCalendarItems,
  getBlockedContentSummary,
  PIPELINE_COLUMNS,
  transitionContentOps,
  type ContentOpsState,
} from '@/lib/jarvis/content-ops'
import { zonedYmd, BUSINESS_TIMEZONE } from '@/lib/time/business-calendar'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const auth = await requireMarketingAdmin()
  if (!auth.ok) return auth.response

  const url = new URL(req.url)
  const mode = (url.searchParams.get('calendar') as 'day' | 'week' | 'month') || 'week'
  const anchor = url.searchParams.get('anchor') || zonedYmd(new Date(), BUSINESS_TIMEZONE)

  const [queue, summary, brief, blocked, calendar] = await Promise.all([
    getContentQueue({ limit: 100 }),
    getContentOpsSummary(),
    buildDailyContentBrief(),
    getBlockedContentSummary(),
    listCalendarItems({ mode, anchorYmd: anchor }),
  ])

  return NextResponse.json({
    success: true,
    summary,
    pipeline_columns: PIPELINE_COLUMNS,
    by_column: queue.by_column,
    needs_attention: queue.needs_attention,
    items: queue.items,
    brief: { ...brief, text: formatDailyBriefText(brief) },
    blocked: blocked.blocked,
    calendar,
    live_publishing_enabled: liveInstagramPublishingEnabled(),
    timezone: BUSINESS_TIMEZONE,
  })
}

export async function POST(req: Request) {
  const auth = await requireMarketingAdmin()
  if (!auth.ok) return auth.response

  const body = (await req.json()) as {
    action?: string
    contentId?: string
    to?: string
    reason?: string
  }

  if (body.action === 'transition' && body.contentId && body.to) {
    const result = await transitionContentOps({
      contentId: body.contentId,
      to: body.to as ContentOpsState,
      reason: body.reason ?? 'command_center_drag',
      actor: auth.user.id,
    })
    return NextResponse.json({ success: result.ok, ...result })
  }

  return NextResponse.json({ success: false, error: 'unsupported_action' }, { status: 400 })
}
