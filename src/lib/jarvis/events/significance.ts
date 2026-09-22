/**
 * Deterministic significance — LLM does not decide alone.
 * Uses structured magnitude / baselines; never fabricates zeros as "ok".
 */

import type {
  EventPriority,
  JarvisCanonicalEvent,
  SignificanceResult,
} from '@/lib/jarvis/events/types'
import { getEventDefinition } from '@/lib/jarvis/events/registry'
import { asOptionalNumber } from '@/lib/jarvis/events/normalize'

function priorityFor(
  action: SignificanceResult['action'],
  fallback: EventPriority
): EventPriority {
  if (action === 'URGENT') return 'P0'
  if (action === 'ALERT') return 'P1'
  if (action === 'INVESTIGATE') return 'P1'
  if (action === 'DIGEST') return 'P2'
  if (action === 'LOG') return 'P3'
  return fallback === 'P4' ? 'P4' : 'P4'
}

export function evaluateSignificance(
  event: JarvisCanonicalEvent,
  opts?: {
    baseline?: Record<string, unknown> | null
    recentDuplicate?: boolean
    cooldownActive?: boolean
    stormDefer?: boolean
  }
): SignificanceResult {
  const def = getEventDefinition(event.event_type)

  if (opts?.recentDuplicate) {
    return {
      action: 'IGNORE',
      priority: 'P4',
      reason: 'Exact or near-duplicate within dedupe window.',
      magnitude: null,
      relative_change: null,
      confidence: 'HIGH',
      baseline: opts.baseline ?? null,
    }
  }

  if (opts?.cooldownActive) {
    return {
      action: 'DIGEST',
      priority: 'P3',
      reason: 'Cooldown active for this fingerprint — digest only, no new investigation.',
      magnitude: null,
      relative_change: null,
      confidence: 'MEDIUM',
      baseline: opts.baseline ?? null,
    }
  }

  if (opts?.stormDefer && def.default_priority !== 'P0') {
    return {
      action: 'DIGEST',
      priority: 'P2',
      reason: 'Event storm protection — coalesce/digest non-critical events.',
      magnitude: null,
      relative_change: null,
      confidence: 'MEDIUM',
      baseline: opts.baseline ?? null,
    }
  }

  const payload = event.payload
  const current = asOptionalNumber(payload.current ?? payload.value ?? payload.cpa ?? payload.amount)
  const previous = asOptionalNumber(payload.previous ?? payload.baseline ?? payload.prior)
  const baselineVal = asOptionalNumber(opts?.baseline?.value ?? payload.baseline_7d)
  const sample = asOptionalNumber(payload.sample_size ?? payload.purchases ?? payload.orders)

  let relative: number | null = null
  if (current != null && previous != null && previous !== 0) {
    relative = (current - previous) / Math.abs(previous)
  } else if (current != null && baselineVal != null && baselineVal !== 0) {
    relative = (current - baselineVal) / Math.abs(baselineVal)
  }

  const magnitude = current != null && previous != null ? Math.abs(current - previous) : current

  // Critical system events
  if (
    event.event_type.startsWith('system.') &&
    (event.severity === 'CRITICAL' || event.event_type.includes('failed'))
  ) {
    return {
      action: event.event_type.includes('cost_limit') ? 'ALERT' : 'URGENT',
      priority: 'P0',
      reason: 'System/integration failure or cost limit — alert without fabricating metrics.',
      magnitude,
      relative_change: relative,
      confidence: 'HIGH',
      baseline: opts?.baseline ?? null,
    }
  }

  // Tiny revenue noise
  if (event.event_type === 'business.revenue_changed' && magnitude != null && magnitude < 50) {
    return {
      action: 'IGNORE',
      priority: 'P4',
      reason: 'Revenue delta below materiality threshold (₹50).',
      magnitude,
      relative_change: relative,
      confidence: 'HIGH',
      baseline: opts?.baseline ?? null,
    }
  }

  if (event.event_type === 'business.order_created') {
    const amount = asOptionalNumber(payload.amount_inr ?? payload.amount)
    if (amount != null && amount >= 1000) {
      return {
        action: 'DIGEST',
        priority: 'P3',
        reason: 'Material order logged for digest.',
        magnitude: amount,
        relative_change: null,
        confidence: 'HIGH',
        baseline: null,
      }
    }
    return {
      action: 'LOG',
      priority: 'P4',
      reason: 'Order recorded.',
      magnitude: amount,
      relative_change: null,
      confidence: 'HIGH',
      baseline: null,
    }
  }

  // CPA / ROAS — require sample; funnel must be present or UNCLASSIFIED (never blend)
  if (event.event_type === 'meta.cpa_changed' || event.event_type === 'meta.roas_changed') {
    if (event.funnel_id == null && payload.allow_unclassified !== true) {
      return {
        action: 'LOG',
        priority: 'P3',
        reason: 'Funnel unclassified — will not apply blended CPA thresholds.',
        magnitude,
        relative_change: relative,
        confidence: 'INSUFFICIENT_DATA',
        baseline: opts?.baseline ?? null,
      }
    }
    if (sample != null && sample < 3) {
      return {
        action: 'LOG',
        priority: 'P3',
        reason: 'Insufficient sample for CPA/ROAS significance.',
        magnitude,
        relative_change: relative,
        confidence: 'INSUFFICIENT_DATA',
        baseline: opts?.baseline ?? null,
      }
    }
    if (relative != null && Math.abs(relative) >= 1.0) {
      return {
        action: 'ALERT',
        priority: 'P0',
        reason: '≥100% relative metric movement with usable sample.',
        magnitude,
        relative_change: relative,
        confidence: 'HIGH',
        baseline: opts?.baseline ?? null,
      }
    }
    if (relative != null && Math.abs(relative) >= 0.2) {
      return {
        action: 'INVESTIGATE',
        priority: 'P1',
        reason: '≥20% relative movement — investigate via existing funnel tools.',
        magnitude,
        relative_change: relative,
        confidence: 'MEDIUM',
        baseline: opts?.baseline ?? null,
      }
    }
    if (relative != null && Math.abs(relative) >= 0.05) {
      return {
        action: 'LOG',
        priority: 'P3',
        reason: 'Small movement — log only.',
        magnitude,
        relative_change: relative,
        confidence: 'MEDIUM',
        baseline: opts?.baseline ?? null,
      }
    }
  }

  // Content overdue minutes
  if (event.event_type === 'content.overdue' || event.event_type === 'instagram.content_overdue') {
    const overdueMin = asOptionalNumber(payload.overdue_minutes ?? payload.minutes)
    if (overdueMin != null && overdueMin < 60) {
      return {
        action: 'IGNORE',
        priority: 'P4',
        reason: 'Overdue by less than 60 minutes — ignore noise.',
        magnitude: overdueMin,
        relative_change: null,
        confidence: 'HIGH',
        baseline: null,
      }
    }
    if (overdueMin != null && overdueMin >= 180) {
      return {
        action: 'INVESTIGATE',
        priority: 'P2',
        reason: 'Content overdue several hours.',
        magnitude: overdueMin,
        relative_change: null,
        confidence: 'HIGH',
        baseline: null,
      }
    }
    return {
      action: 'DIGEST',
      priority: 'P3',
      reason: 'Content overdue — digest.',
      magnitude: overdueMin,
      relative_change: null,
      confidence: 'MEDIUM',
      baseline: null,
    }
  }

  if (event.event_type === 'instagram.reach_spike') {
    const mult = asOptionalNumber(payload.reach_multiple ?? payload.multiple)
    if (mult != null && mult >= 5) {
      return {
        action: 'INVESTIGATE',
        priority: 'P2',
        reason: 'Reach ≥5× typical — investigate (no virality claim).',
        magnitude: mult,
        relative_change: null,
        confidence: 'MEDIUM',
        baseline: opts?.baseline ?? null,
      }
    }
  }

  if (event.event_type === 'video.render_failed') {
    return {
      action: 'INVESTIGATE',
      priority: 'P1',
      reason: 'Video render failure — investigate provider status.',
      magnitude: null,
      relative_change: null,
      confidence: 'HIGH',
      baseline: null,
    }
  }

  // Default from registry
  const action = def.significance_default
  return {
    action,
    priority: priorityFor(action, def.default_priority),
    reason: `Registry default for ${event.event_type}.`,
    magnitude,
    relative_change: relative,
    confidence: relative == null && magnitude == null ? 'LOW' : 'MEDIUM',
    baseline: opts?.baseline ?? null,
  }
}
