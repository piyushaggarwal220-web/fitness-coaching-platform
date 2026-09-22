/**
 * Analyze local + optional live Instagram content.
 * Does not claim causation unless verified metrics support a descriptive pattern.
 */

import {
  listLocalInstagramContent,
  localEngagementScore,
  type MarketingContentRow,
} from '@/lib/jarvis/instagram/content-store'
import {
  listInstagramMedia,
  type InstagramProviderOptions,
} from '@/lib/jarvis/instagram/provider'
import type { DataStatus } from '@/lib/jarvis/diagnostics/diagnostic-types'

function topicKey(row: MarketingContentRow): string {
  return (row.topic || row.content_category || 'untagged').toLowerCase().trim()
}

export async function analyzeInstagramContent(input?: {
  limit?: number
  includeLiveMedia?: boolean
  actorId?: string | null
  providerOpts?: InstagramProviderOptions
}): Promise<{
  source: string
  data_status: DataStatus
  retrieved_at: string
  period: { label: string }
  timezone: string
  value: {
    strongest_posts: { id: string; topic: string | null; score: number; basis: string }[]
    weakest_posts: { id: string; topic: string | null; score: number; basis: string }[]
    format_distribution: Record<string, number>
    posting_frequency: {
      posts_considered: number | null
      posts_with_posted_at: number | null
      avg_days_between_posts: number | null
      data_status: DataStatus
      note: string
    }
    recurring_topics: { topic: string; count: number }[]
    engagement_patterns: {
      note: string
      average_engagement_when_known: number | null
      posts_with_metrics: number
      posts_without_metrics: number
      data_status: DataStatus
    }
    live_media?: {
      data_status: DataStatus
      count: number | null
      note: string
    }
    caveats: string[]
  } | null
  note: string
  error?: string
}> {
  const retrieved_at = new Date().toISOString()
  const local = await listLocalInstagramContent(input?.limit ?? 40)

  if (local.data_status !== 'verified' || !local.value) {
    return {
      source: 'instagram.analyze_content',
      data_status: local.data_status,
      retrieved_at,
      period: { label: 'local_marketing_content' },
      timezone: 'Asia/Kolkata',
      value: null,
      note: local.note,
      error: local.error,
    }
  }

  const rows = local.value
  const scored = rows
    .map((row) => {
      const score = localEngagementScore(row)
      return score == null
        ? null
        : {
            id: row.id,
            topic: row.topic,
            score,
            basis: 'sum of non-null likes+comments+shares+saves on marketing_content (not Graph)',
          }
    })
    .filter((r): r is NonNullable<typeof r> => r != null)
    .sort((a, b) => b.score - a.score)

  const format_distribution: Record<string, number> = {}
  for (const row of rows) {
    const key = row.content_type || 'unknown'
    format_distribution[key] = (format_distribution[key] ?? 0) + 1
  }

  const topicCounts = new Map<string, number>()
  for (const row of rows) {
    const t = topicKey(row)
    topicCounts.set(t, (topicCounts.get(t) ?? 0) + 1)
  }
  const recurring_topics = [...topicCounts.entries()]
    .map(([topic, count]) => ({ topic, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10)

  const postedDates = rows
    .map((r) => r.posted_at)
    .filter((d): d is string => !!d)
    .map((d) => new Date(d).getTime())
    .filter((t) => Number.isFinite(t))
    .sort((a, b) => a - b)

  let avg_days_between_posts: number | null = null
  let postingStatus: DataStatus = 'unavailable'
  let postingNote =
    'Posting frequency unavailable — insufficient posted_at timestamps on marketing_content.'
  if (postedDates.length >= 2) {
    const gaps: number[] = []
    for (let i = 1; i < postedDates.length; i++) {
      gaps.push((postedDates[i]! - postedDates[i - 1]!) / (1000 * 60 * 60 * 24))
    }
    avg_days_between_posts = gaps.reduce((a, b) => a + b, 0) / gaps.length
    postingStatus = 'verified'
    postingNote = `Average gap across ${postedDates.length} posted items with timestamps.`
  } else if (postedDates.length === 0 && rows.length === 0) {
    postingStatus = 'verified'
    postingNote = 'No local posts (verified empty). Frequency is not applicable.'
  } else if (postedDates.length === 1) {
    postingStatus = 'partial'
    postingNote = 'Only one posted_at timestamp — cannot compute average gap.'
  }

  const avgEngagement =
    scored.length > 0 ? scored.reduce((a, b) => a + b.score, 0) / scored.length : null

  const caveats = [
    'Strongest/weakest rankings use only rows with at least one verified engagement field.',
    'Null metric fields are ignored — they are not treated as zero.',
    'Do not claim a hook/format caused performance unless an explicit experiment supports it.',
  ]

  let live_media:
    | { data_status: DataStatus; count: number | null; note: string }
    | undefined
  if (input?.includeLiveMedia) {
    const live = await listInstagramMedia(
      { limit: 12 },
      { ...input.providerOpts, actorId: input.actorId }
    )
    live_media = {
      data_status: live.data_status,
      count: live.value ? live.value.length : null,
      note: live.note ?? live.error ?? 'Live media check complete.',
    }
    if (live.data_status === 'failed' || live.data_status === 'unavailable') {
      caveats.push('Live Graph media was unavailable; analysis used local marketing_content only.')
    }
  }

  return {
    source: 'instagram.analyze_content',
    data_status: scored.length ? 'verified' : rows.length ? 'partial' : 'verified',
    retrieved_at,
    period: { label: 'local_marketing_content' },
    timezone: 'Asia/Kolkata',
    value: {
      strongest_posts: scored.slice(0, 5),
      weakest_posts: [...scored].reverse().slice(0, 5),
      format_distribution,
      posting_frequency: {
        posts_considered: rows.length,
        posts_with_posted_at: postedDates.length,
        avg_days_between_posts,
        data_status: postingStatus,
        note: postingNote,
      },
      recurring_topics,
      engagement_patterns: {
        note:
          scored.length === 0
            ? 'No local engagement metrics present — engagement patterns unavailable (not zero).'
            : 'Average engagement across posts that have at least one numeric engagement field.',
        average_engagement_when_known: avgEngagement,
        posts_with_metrics: scored.length,
        posts_without_metrics: rows.length - scored.length,
        data_status: scored.length ? 'verified' : 'unavailable',
      },
      live_media,
      caveats,
    },
    note: 'Content analysis descriptive only. Causation not claimed.',
  }
}

export async function localContentPerformance(limit = 30) {
  const local = await listLocalInstagramContent(limit)
  if (local.data_status !== 'verified' || !local.value) {
    return {
      ...local,
      value: null as null,
    }
  }

  const items = local.value.map((row) => ({
    id: row.id,
    topic: row.topic,
    status: row.status,
    content_type: row.content_type,
    views: row.views,
    reach: row.reach,
    likes: row.likes,
    comments: row.comments,
    shares: row.shares,
    saves: row.saves,
    engagement_score: localEngagementScore(row),
    posted_at: row.posted_at,
    scheduled_for: row.scheduled_for,
    metrics_data_status:
      [row.views, row.reach, row.likes, row.comments, row.shares, row.saves].some((v) => v != null)
        ? ('partial' as const)
        : ('unavailable' as const),
  }))

  return {
    source: 'marketing_content.performance',
    data_status: 'verified' as const,
    retrieved_at: local.retrieved_at,
    period: null,
    timezone: 'Asia/Kolkata',
    value: items,
    note: 'Local performance fields only. Nulls are not zero. Graph insights are separate.',
  }
}

export async function localPostingFrequency(limit = 50) {
  const analysis = await analyzeInstagramContent({ limit })
  return {
    source: 'instagram.posting_frequency',
    data_status: analysis.value?.posting_frequency.data_status ?? analysis.data_status,
    retrieved_at: analysis.retrieved_at,
    period: analysis.period,
    timezone: analysis.timezone,
    value: analysis.value?.posting_frequency ?? null,
    note: analysis.value?.posting_frequency.note ?? analysis.note,
  }
}

export async function localEngagementSummary(limit = 40) {
  const analysis = await analyzeInstagramContent({ limit })
  return {
    source: 'instagram.engagement_summary',
    data_status: analysis.value?.engagement_patterns.data_status ?? analysis.data_status,
    retrieved_at: analysis.retrieved_at,
    period: analysis.period,
    timezone: analysis.timezone,
    value: analysis.value?.engagement_patterns ?? null,
    note: analysis.value?.engagement_patterns.note ?? analysis.note,
  }
}
