/**
 * Daily content brief + weekly report (evidence-backed language).
 */

import { BUSINESS_TIMEZONE, zonedYmd } from '@/lib/time/business-calendar'
import { getContentQueue } from '@/lib/jarvis/content-ops/queue'
import { observedMix } from '@/lib/jarvis/content-ops/mix'
import { createAdminClient } from '@/lib/supabase/admin'
import type { DailyContentBrief, WeeklyContentReport } from '@/lib/jarvis/content-ops/types'

export async function buildDailyContentBrief(
  now: Date = new Date()
): Promise<DailyContentBrief> {
  const tz = BUSINESS_TIMEZONE
  const date = zonedYmd(now, tz)
  const { items, needs_attention } = await getContentQueue({ limit: 150 })

  const needs_review = items.filter((i) => i.status === 'REVIEW' || i.status === 'REVISION_REQUESTED')
    .length
  const needs_footage = items.filter((i) => i.next_action === 'UPLOAD_FOOTAGE').length
  const scheduled = items.filter((i) => i.status === 'SCHEDULED').length
  const published = items.filter((i) => i.status === 'PUBLISHED' || i.status === 'MEASURING').length

  let trend_opportunity = 0
  try {
    const admin = createAdminClient()
    const since = new Date(now.getTime() - 72 * 3600_000).toISOString()
    const { count } = await admin
      .from('jarvis_instagram_content_opportunities')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', since)
    trend_opportunity = count ?? 0
  } catch {
    trend_opportunity = 0
  }

  let performance_note: string | null = null
  try {
    const admin = createAdminClient()
    const { data } = await admin
      .from('marketing_content')
      .select('topic, reach, views')
      .eq('platform', 'instagram')
      .eq('status', 'posted')
      .order('posted_at', { ascending: false })
      .limit(5)
    const reaches = (data ?? [])
      .map((r) => r.reach as number | null)
      .filter((n): n is number => typeof n === 'number' && Number.isFinite(n))
    if (reaches.length >= 2) {
      const latest = reaches[0]
      const rest = reaches.slice(1)
      const median = [...rest].sort((a, b) => a - b)[Math.floor(rest.length / 2)]
      if (median > 0 && latest != null) {
        const ratio = Math.round((latest / median) * 10) / 10
        performance_note = `Most recent Reel reach was ${ratio}× the median of the prior ${rest.length} posted item(s) with reach data.`
      }
    }
  } catch {
    performance_note = null
  }

  const top = needs_attention[0]
  const next_action = top
    ? `${top.next_action_label}: ${top.title}`
    : null

  const meaningful =
    needs_review > 0 ||
    needs_footage > 0 ||
    trend_opportunity > 0 ||
    Boolean(performance_note) ||
    scheduled > 0

  return {
    date,
    timezone: tz,
    published,
    scheduled,
    needs_review,
    needs_footage,
    trend_opportunity,
    performance_note,
    next_action,
    meaningful,
  }
}

export function formatDailyBriefText(brief: DailyContentBrief): string {
  return [
    `CONTENT BRIEF — ${brief.date} (${brief.timezone})`,
    `Published: ${brief.published}`,
    `Scheduled: ${brief.scheduled}`,
    `Needs review: ${brief.needs_review}`,
    `Needs footage: ${brief.needs_footage}`,
    `Trend opportunity: ${brief.trend_opportunity}`,
    brief.performance_note ? `Performance: ${brief.performance_note}` : null,
    brief.next_action ? `Next action: ${brief.next_action}` : null,
  ]
    .filter(Boolean)
    .join('\n')
}

export async function buildWeeklyContentReport(
  now: Date = new Date()
): Promise<WeeklyContentReport> {
  const tz = BUSINESS_TIMEZONE
  const end = zonedYmd(now, tz)
  const startDate = new Date(now.getTime() - 7 * 86400000)
  const week_start = zonedYmd(startDate, tz)

  const admin = createAdminClient()
  const { data: rows } = await admin
    .from('marketing_content')
    .select(
      'topic, content_type, content_mix_pillar, ops_state, status, posted_at, scheduled_for, reach, views'
    )
    .eq('platform', 'instagram')
    .gte('updated_at', startDate.toISOString())
    .limit(200)

  const list = rows ?? []
  const posts_published = list.filter(
    (r) => r.ops_state === 'PUBLISHED' || r.ops_state === 'MEASURING' || r.status === 'posted'
  ).length
  const posts_scheduled = list.filter(
    (r) => r.ops_state === 'SCHEDULED' || r.status === 'scheduled'
  ).length
  const posts_completed = list.filter((r) => r.ops_state === 'COMPLETED').length

  const content_mix = observedMix(list.map((r) => r.content_mix_pillar as string | null))

  const topicCounts: Record<string, number> = {}
  for (const r of list) {
    const t = ((r.topic as string) || '').slice(0, 40)
    if (!t) continue
    topicCounts[t] = (topicCounts[t] ?? 0) + 1
  }
  const top_observed_topics = Object.entries(topicCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([t]) => t)

  const formatCounts: Record<string, number> = {}
  for (const r of list) {
    const f = (r.content_type as string) || 'unknown'
    formatCounts[f] = (formatCounts[f] ?? 0) + 1
  }
  const strongest_observed_formats = Object.entries(formatCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([f, n]) => `${f} (n=${n})`)

  const { needs_attention } = await getContentQueue({ limit: 50 })
  const pending_work = needs_attention.slice(0, 8).map((i) => `${i.next_action_label}: ${i.title}`)

  let content_gaps: string[] = []
  let external_trends: string[] = []
  try {
    const { data: opps } = await admin
      .from('jarvis_instagram_content_opportunities')
      .select('title, opportunity_type')
      .order('created_at', { ascending: false })
      .limit(10)
    content_gaps = (opps ?? [])
      .filter((o) => String(o.opportunity_type).includes('GAP'))
      .map((o) => String(o.title))
      .slice(0, 5)
    external_trends = (opps ?? [])
      .filter((o) => !String(o.opportunity_type).includes('GAP'))
      .map((o) => String(o.title))
      .slice(0, 5)
  } catch {
    /* optional */
  }

  const performance_changes: string[] = []
  const reaches = list
    .map((r) => r.reach as number | null)
    .filter((n): n is number => typeof n === 'number' && Number.isFinite(n))
  if (reaches.length >= 2) {
    const median = [...reaches].sort((a, b) => a - b)[Math.floor(reaches.length / 2)]
    performance_changes.push(
      `${reaches.length} posted items had reach data this window; median reach ${median} (not a causal claim).`
    )
  } else {
    performance_changes.push('Insufficient reach data for comparison this window.')
  }

  return {
    week_start,
    week_end: end,
    posts_published,
    posts_scheduled,
    posts_completed,
    content_mix,
    top_observed_topics,
    strongest_observed_formats,
    content_gaps,
    external_trends,
    performance_changes,
    pending_work,
    next_week_proposal_summary: null,
    limitations: [
      'Does not label content as best/worst.',
      'Does not claim causality from hooks or edits.',
      'Does not predict virality.',
      'USER_TASTE is not updated from these audience signals automatically.',
    ],
  }
}
