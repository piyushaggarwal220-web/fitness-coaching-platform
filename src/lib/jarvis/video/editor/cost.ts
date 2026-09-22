/**
 * Render cost estimation for EDL → Shotstack.
 */

import { estimateShotstackCostUsd } from '@/lib/jarvis/video/shotstack/client'
import { assertAiBudgetAvailable } from '@/lib/jarvis/cost/usage'
import { sec } from '@/lib/jarvis/video/editor/types'

export function estimateEdlRenderCostUsd(durationMs: number): number {
  return estimateShotstackCostUsd(Math.max(1, sec(durationMs)))
}

export async function gateEdlRenderBudget(estimatedUsd: number): Promise<{
  ok: boolean
  reason?: string
  estimated_usd: number
}> {
  const gate = await assertAiBudgetAvailable(estimatedUsd)
  if (!gate.ok) {
    return { ok: false, reason: gate.reason, estimated_usd: estimatedUsd }
  }
  return { ok: true, estimated_usd: estimatedUsd }
}
