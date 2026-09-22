/**
 * Deterministic schedule proposal layer.
 * Never claims a weekday is inherently better without supporting data.
 */

import { createHash } from 'node:crypto'
import { BUSINESS_TIMEZONE, zonedLocalToUtc, zonedYmd } from '@/lib/time/business-calendar'
import { detectCollisions } from '@/lib/jarvis/content-ops/collision'
import {
  DEFAULT_MIX,
  mixCountsForBatch,
  normalizeMix,
  pickNextPillar,
  type MixTargets,
} from '@/lib/jarvis/content-ops/mix'
import type {
  CadencePreset,
  ContentBatchProposal,
  ScheduleProposalSlot,
} from '@/lib/jarvis/content-ops/types'
import { createAdminClient } from '@/lib/supabase/admin'

export function postsPerWeekFromCadence(cadence: CadencePreset | number): number {
  if (typeof cadence === 'number') return Math.max(0, Math.min(21, Math.floor(cadence)))
  switch (cadence) {
    case 'daily':
      return 7
    case '5_per_week':
      return 5
    case '3_per_week':
      return 3
    default:
      return 3
  }
}

function preferredSlots(
  windowStart: string,
  days: number,
  posts: number,
  preferredHours: number[],
  timezone: string
): { date: string; time_local: string }[] {
  const [y, mo, d] = windowStart.split('-').map(Number)
  const slots: { date: string; time_local: string }[] = []
  const hour = preferredHours[0] ?? 19
  // Spread across weekdays first (Mon–Sat), no inherent "best day" claim
  const dayOffsets: number[] = []
  for (let i = 0; i < days && dayOffsets.length < posts; i++) {
    const probe = zonedLocalToUtc(timezone, y, mo, d + i, 12, 0, 0)
    const wd = new Intl.DateTimeFormat('en-US', { timeZone: timezone, weekday: 'short' }).format(
      probe
    )
    if (wd !== 'Sun' || posts >= 7) dayOffsets.push(i)
  }
  while (dayOffsets.length < posts) {
    dayOffsets.push(dayOffsets.length % Math.max(days, 1))
  }
  for (let i = 0; i < posts; i++) {
    const off = dayOffsets[i] ?? i
    const date = zonedYmd(zonedLocalToUtc(timezone, y, mo, d + off, 12, 0, 0), timezone)
    const h = preferredHours[i % preferredHours.length] ?? hour
    slots.push({
      date,
      time_local: `${String(h).padStart(2, '0')}:30`,
    })
  }
  return slots
}

export async function proposeContentSchedule(input: {
  windowStartYmd?: string
  days?: number
  cadence?: CadencePreset | number
  mix?: MixTargets
  preferredHours?: number[]
  timezone?: string
  queueTitles?: { id?: string; title: string; pillar?: string; objective?: string; format?: string }[]
  contentGaps?: string[]
  trends?: string[]
  availableCompletedVideos?: number
}): Promise<ContentBatchProposal> {
  const tz = input.timezone ?? BUSINESS_TIMEZONE
  const days = input.days ?? 7
  const posts = postsPerWeekFromCadence(input.cadence ?? '3_per_week')
  const mix = normalizeMix(input.mix ?? DEFAULT_MIX)
  const start =
    input.windowStartYmd ??
    zonedYmd(new Date(Date.now() + 86400000), tz)
  const endDate = zonedLocalToUtc(
    tz,
    ...((() => {
      const [y, mo, d] = start.split('-').map(Number)
      return [y, mo, d + days - 1] as [number, number, number]
    })()),
    23,
    59,
    0
  )
  const window_end = zonedYmd(endDate, tz)

  const remaining = mixCountsForBatch(posts, mix)
  const slots = preferredSlots(start, days, posts, input.preferredHours ?? [19, 20], tz)
  const recentPillars: string[] = []
  const items: ScheduleProposalSlot[] = []
  const queue = [...(input.queueTitles ?? [])]
  const existing: {
    id: string
    topic: string | null
    hook: string | null
    cta: string | null
    pillar?: string | null
    scheduled_for?: string | null
  }[] = []

  try {
    const admin = createAdminClient()
    const { data } = await admin
      .from('marketing_content')
      .select('id, topic, hook, cta, content_mix_pillar, scheduled_for')
      .eq('platform', 'instagram')
      .not('scheduled_for', 'is', null)
      .limit(50)
    for (const r of data ?? []) {
      existing.push({
        id: r.id as string,
        topic: r.topic as string | null,
        hook: r.hook as string | null,
        cta: r.cta as string | null,
        pillar: r.content_mix_pillar as string | null,
        scheduled_for: r.scheduled_for as string | null,
      })
    }
  } catch {
    /* offline */
  }

  for (let i = 0; i < slots.length; i++) {
    const pillar = pickNextPillar(remaining, recentPillars) ?? 'education'
    if (remaining[pillar] != null) remaining[pillar] -= 1
    recentPillars.push(pillar)

    const fromQueue = queue.shift()
    const gap = input.contentGaps?.[i % Math.max(input.contentGaps.length, 1)]
    const trend = input.trends?.[i % Math.max(input.trends?.length || 1, 1)]
    const title =
      fromQueue?.title ||
      gap ||
      (trend ? `Original angle on observed topic: ${trend.slice(0, 60)}` : `Content slot ${i + 1}`)

    const basis: string[] = []
    if (fromQueue) basis.push('existing queue item')
    if (gap) basis.push('content gap')
    if (trend) basis.push('current trend observation')
    if ((input.availableCompletedVideos ?? 0) > 0) basis.push('available completed video')
    basis.push(`mix target (${pillar})`)
    basis.push(`cadence ${posts}/week`)

    const candidate = {
      id: fromQueue?.id ?? `proposal-${i}`,
      topic: title,
      hook: null,
      cta: null,
      pillar,
      scheduled_for: `${slots[i].date}T${slots[i].time_local}:00`,
    }
    const collision = detectCollisions({ candidate, existing })

    items.push({
      date: slots[i].date,
      time_local: slots[i].time_local,
      timezone: tz,
      content_id: fromQueue?.id ?? null,
      title,
      format: fromQueue?.format ?? 'reel',
      objective: fromQueue?.objective ?? null,
      pillar,
      reason: `${basis.join(' + ')}.`,
      basis,
      collision_flags: collision.flags,
    })
    existing.push(candidate)
  }

  const rationale = [
    `Proposed ${posts}-post schedule over ${days} days in ${tz}.`,
    `Mix targets: ${Object.entries(mix)
      .map(([k, v]) => `${k} ${v}%`)
      .join(', ')}.`,
    'Weekday placement spreads load; no claim that a specific day is inherently better without account data.',
  ]
  const limitations = [
    'Proposal only — not scheduled until approved.',
    'Does not predict reach or virality.',
    'External trends inspire topic/angle only; scripts are not copied.',
  ]
  if ((input.availableCompletedVideos ?? 0) === 0) {
    limitations.push('No completed renders in inputs — footage/edit still required.')
  }

  const fingerprint = createHash('sha256')
    .update(JSON.stringify({ start, window_end, posts, mix, titles: items.map((i) => i.title) }))
    .digest('hex')
    .slice(0, 24)

  return {
    fingerprint,
    window_start: start,
    window_end,
    cadence: { posts_per_week: posts, mix },
    items,
    rationale,
    limitations,
  }
}
