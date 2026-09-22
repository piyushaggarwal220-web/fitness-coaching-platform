/**
 * Content collision / duplication prevention (configurable spacing).
 * Ambiguous duplicates → flag, do not silently block.
 */

import type { ContentMixPillar } from '@/lib/jarvis/content-ops/types'

export type CollisionCandidate = {
  id: string
  topic: string | null
  hook: string | null
  cta: string | null
  pillar?: ContentMixPillar | null
  footage_key?: string | null
  scheduled_for?: string | null
}

export type CollisionResult = {
  blocked: boolean
  flags: string[]
}

function norm(s: string | null | undefined): string {
  return (s ?? '').toLowerCase().replace(/\s+/g, ' ').trim()
}

function hoursBetween(a: string | null | undefined, b: string | null | undefined): number | null {
  if (!a || !b) return null
  const ms = Math.abs(new Date(a).getTime() - new Date(b).getTime())
  if (!Number.isFinite(ms)) return null
  return ms / 3_600_000
}

export function detectCollisions(input: {
  candidate: CollisionCandidate
  existing: CollisionCandidate[]
  minHoursBetweenSimilarTopics?: number
  maxConsecutivePromotion?: number
}): CollisionResult {
  const minHours = input.minHoursBetweenSimilarTopics ?? 72
  const maxPromo = input.maxConsecutivePromotion ?? 1
  const flags: string[] = []
  let blocked = false

  const candTopic = norm(input.candidate.topic)
  const candHook = norm(input.candidate.hook)
  const candCta = norm(input.candidate.cta)
  const candFootage = norm(input.candidate.footage_key)

  for (const ex of input.existing) {
    if (ex.id === input.candidate.id) continue
    const gap = hoursBetween(input.candidate.scheduled_for, ex.scheduled_for)

    if (candTopic && candTopic === norm(ex.topic) && (gap == null || gap < minHours)) {
      flags.push('DUPLICATE_TOPIC')
      if (gap != null && gap < minHours) blocked = true
      else if (gap == null) flags.push('DUPLICATE_TOPIC_AMBIGUOUS')
    }

    if (candHook && candHook.length > 12 && candHook === norm(ex.hook)) {
      flags.push('IDENTICAL_HOOK')
      blocked = true
    }

    if (candCta && candCta.length > 4 && candCta === norm(ex.cta) && (gap == null || gap < 48)) {
      flags.push('REPEATED_CTA')
      if (gap == null) flags.push('REPEATED_CTA_AMBIGUOUS')
    }

    if (candFootage && candFootage === norm(ex.footage_key)) {
      flags.push('DUPLICATE_FOOTAGE')
      blocked = true
    }
  }

  const scheduledSorted = [...input.existing, input.candidate]
    .filter((c) => c.scheduled_for)
    .sort((a, b) => String(a.scheduled_for).localeCompare(String(b.scheduled_for)))

  let promoRun = 0
  for (const item of scheduledSorted) {
    if ((item.pillar ?? '').toLowerCase() === 'promotion') {
      promoRun += 1
      if (promoRun > maxPromo && item.id === input.candidate.id) {
        flags.push('TOO_MANY_PROMOTIONAL_CONSECUTIVE')
        blocked = true
      }
    } else {
      promoRun = 0
    }
  }

  return { blocked, flags: [...new Set(flags)] }
}
