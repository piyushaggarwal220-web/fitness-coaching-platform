/**
 * Budget/capacity reservation — prevents concurrent overspend of auto-execution budget.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import type { ExecutionLimits } from '@/lib/jarvis/execution/policy/types'
import { randomUUID } from 'crypto'

const memoryReservations = new Map<
  string,
  { cost: number; hourKey: string; dayKey: string; released: boolean }
>()

function hourKey(d = new Date()) {
  return d.toISOString().slice(0, 13)
}
function dayKey(d = new Date()) {
  return d.toISOString().slice(0, 10)
}

export type ReservationResult =
  | { ok: true; reservationId: string }
  | { ok: false; code: 'BLOCKED_BUDGET' | 'RATE_LIMIT'; reason: string }

export async function reserveExecutionCapacity(input: {
  estimatedCostUsd: number
  limits: ExecutionLimits
  toolName: string
  system: string
}): Promise<ReservationResult> {
  const cost = Math.max(0, input.estimatedCostUsd)
  if (cost > input.limits.max_auto_action_cost_usd) {
    return {
      ok: false,
      code: 'BLOCKED_BUDGET',
      reason: `Per-action auto cost cap exceeded ($${cost.toFixed(4)} > $${input.limits.max_auto_action_cost_usd}).`,
    }
  }

  const hk = hourKey()
  const dk = dayKey()
  let hourCount = 0
  let dayCount = 0
  let dayCost = 0
  let monthCost = 0

  for (const r of memoryReservations.values()) {
    if (r.released) continue
    if (r.hourKey === hk) hourCount += 1
    if (r.dayKey === dk) {
      dayCount += 1
      dayCost += r.cost
    }
  }

  try {
    const admin = createAdminClient()
    const monthStart = new Date()
    monthStart.setUTCDate(1)
    monthStart.setUTCHours(0, 0, 0, 0)
    const hourStart = new Date()
    hourStart.setMinutes(0, 0, 0)

    const { data: rows } = await admin
      .from('jarvis_execution_reservations')
      .select('estimated_cost_usd, created_at, released_at, status')
      .gte('created_at', monthStart.toISOString())
      .in('status', ['reserved', 'consumed'])

    for (const r of rows ?? []) {
      if (r.released_at) continue
      const c = Number(r.estimated_cost_usd) || 0
      monthCost += c
      const created = Date.parse(String(r.created_at))
      if (created >= hourStart.getTime()) hourCount += 1
      if (String(r.created_at).slice(0, 10) === dk) {
        dayCount += 1
        dayCost += c
      }
    }
  } catch {
    /* memory only */
  }

  if (hourCount >= input.limits.max_auto_actions_per_hour) {
    return {
      ok: false,
      code: 'RATE_LIMIT',
      reason: `Hourly auto-action cap reached (${input.limits.max_auto_actions_per_hour}).`,
    }
  }
  if (dayCount >= input.limits.max_auto_actions_per_day) {
    return {
      ok: false,
      code: 'RATE_LIMIT',
      reason: `Daily auto-action count cap reached (${input.limits.max_auto_actions_per_day}).`,
    }
  }
  if (dayCost + cost > input.limits.max_auto_daily_action_cost_usd) {
    return {
      ok: false,
      code: 'BLOCKED_BUDGET',
      reason: `Daily auto-action cost cap would be exceeded.`,
    }
  }
  if (monthCost + cost > input.limits.max_auto_monthly_action_cost_usd) {
    return {
      ok: false,
      code: 'BLOCKED_BUDGET',
      reason: `Monthly auto-action cost cap would be exceeded.`,
    }
  }

  const id = randomUUID()
  memoryReservations.set(id, { cost, hourKey: hk, dayKey: dk, released: false })

  try {
    const admin = createAdminClient()
    await admin.from('jarvis_execution_reservations').insert({
      id,
      tool_name: input.toolName,
      system: input.system,
      estimated_cost_usd: cost,
      status: 'reserved',
    })
  } catch {
    /* memory reservation only */
  }

  return { ok: true, reservationId: id }
}

export async function reconcileReservation(input: {
  reservationId: string
  actualCostUsd: number
  consume: boolean
}): Promise<void> {
  const mem = memoryReservations.get(input.reservationId)
  if (mem) {
    mem.released = true
    mem.cost = input.actualCostUsd
  }
  try {
    const admin = createAdminClient()
    await admin
      .from('jarvis_execution_reservations')
      .update({
        status: input.consume ? 'consumed' : 'released',
        actual_cost_usd: input.actualCostUsd,
        released_at: new Date().toISOString(),
      })
      .eq('id', input.reservationId)
  } catch {
    /* ignore */
  }
}
