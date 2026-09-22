/**
 * Gate: apply execution policy around the existing permission decision.
 * Tightens — never loosens FORBIDDEN / DANGEROUS / env live flags.
 */

import { resolveAndEvaluatePolicy } from '@/lib/jarvis/execution/policy'
import {
  buildIdempotencyKey,
  extractTarget,
  fingerprintToolInput,
} from '@/lib/jarvis/execution/idempotency'
import { findReceiptByIdempotency, createExecutionReceipt } from '@/lib/jarvis/execution/receipts'
import { acquireExecutionLock } from '@/lib/jarvis/execution/locks'
import { reserveExecutionCapacity } from '@/lib/jarvis/execution/reservations'
import { buildRollbackPlan } from '@/lib/jarvis/execution/rollback'
import type { PolicyResult } from '@/lib/jarvis/execution/policy/types'
import type { ExecutionReceipt } from '@/lib/jarvis/execution/policy/types'

export type ExecutionGateResult = {
  policy: PolicyResult
  idempotencyKey: string
  receipt: ExecutionReceipt | null
  existingReceipt: ExecutionReceipt | null
  lockKey: string
  reservationId: string | null
  blockStatus?: 'blocked' | 'budget_exhausted' | 'requires_approval' | 'prepare_only'
  blockSummary?: string
  dryRun: boolean
  shadow: boolean
  rollbackNote: string
}

export async function runExecutionGate(input: {
  toolName: string
  riskClass: string
  riskLevel: string
  estimatedCostUsd: number
  toolInput: Record<string, unknown>
  source?: 'chat' | 'cron' | 'event' | 'system'
  approvedExecution?: boolean
  actorId?: string | null
  toolCallId?: string | null
  taskId?: string | null
  /** Permission engine already said execute | require_approval | blocked */
  permissionMode: 'execute' | 'require_approval' | 'blocked'
}): Promise<ExecutionGateResult> {
  const fp = fingerprintToolInput(input.toolInput)
  const target = extractTarget(input.toolName, input.toolInput)

  const existingProbe = await findReceiptByIdempotency(
    // provisional — refine after policy system/class
    buildIdempotencyKey({
      system: 'OTHER',
      action_class: 'UNKNOWN',
      tool_name: input.toolName,
      target_id: target.target_id,
      input_fingerprint: fp,
    })
  )

  const { facts, result, config } = await resolveAndEvaluatePolicy({
    toolName: input.toolName,
    riskClass: input.riskClass,
    riskLevel: input.riskLevel,
    estimatedCostUsd: input.estimatedCostUsd,
    source: input.source,
    approvedExecution: input.approvedExecution,
    alreadySucceeded: Boolean(
      existingProbe && (existingProbe.status === 'executed' || existingProbe.status === 'verified')
    ),
    duplicateRunning: Boolean(
      existingProbe && (existingProbe.status === 'executing' || existingProbe.status === 'reserved')
    ),
  })

  const idempotencyKey = buildIdempotencyKey({
    system: result.system,
    action_class: result.action_class,
    tool_name: input.toolName,
    target_id: target.target_id,
    input_fingerprint: fp,
  })

  const existing = await findReceiptByIdempotency(idempotencyKey)
  if (existing && (existing.status === 'executed' || existing.status === 'verified')) {
    return {
      policy: {
        ...result,
        decision: 'BLOCKED',
        code: 'ALREADY_DONE',
        reason: 'Identical action already succeeded.',
      },
      idempotencyKey,
      receipt: existing,
      existingReceipt: existing,
      lockKey: `exec:${idempotencyKey}`,
      reservationId: null,
      blockStatus: 'blocked',
      blockSummary: 'Idempotent replay — returning existing successful receipt.',
      dryRun: config.dry_run,
      shadow: config.shadow_mode,
      rollbackNote: '',
    }
  }

  const rollback = buildRollbackPlan({
    toolName: input.toolName,
    actionClass: result.action_class,
    beforeState: {},
    toolInput: input.toolInput,
  })

  // Kill switch / blocked
  if (result.decision === 'BLOCKED') {
    const receipt = await createExecutionReceipt({
      toolName: input.toolName,
      system: result.system,
      actionClass: result.action_class,
      idempotencyKey,
      status: 'blocked',
      policyDecision: result.decision,
      policyReason: result.reason,
      estimatedCostUsd: input.estimatedCostUsd,
      toolCallId: input.toolCallId,
      taskId: input.taskId,
      adminUserId: input.actorId,
      targetType: target.target_type,
      targetId: target.target_id,
      dryRun: config.dry_run,
      shadow: config.shadow_mode,
      metadata: { code: result.code, rollback: rollback.note },
    })
    return {
      policy: result,
      idempotencyKey,
      receipt,
      existingReceipt: existing,
      lockKey: `exec:${idempotencyKey}`,
      reservationId: null,
      blockStatus: result.code === 'BUDGET' || result.code === 'RATE_LIMIT' ? 'budget_exhausted' : 'blocked',
      blockSummary: result.reason,
      dryRun: config.dry_run,
      shadow: config.shadow_mode,
      rollbackNote: rollback.note,
    }
  }

  // PREPARE_ONLY / dry-run / shadow — no external write
  if (result.decision === 'PREPARE_ONLY') {
    const receipt = await createExecutionReceipt({
      toolName: input.toolName,
      system: result.system,
      actionClass: result.action_class,
      idempotencyKey,
      status: config.dry_run ? 'dry_run' : config.shadow_mode ? 'shadow' : 'proposed',
      policyDecision: result.decision,
      policyReason: result.reason,
      estimatedCostUsd: input.estimatedCostUsd,
      toolCallId: input.toolCallId,
      taskId: input.taskId,
      adminUserId: input.actorId,
      targetType: target.target_type,
      targetId: target.target_id,
      dryRun: config.dry_run || result.code === 'DRY_RUN',
      shadow: config.shadow_mode || result.code === 'SHADOW',
      metadata: { code: result.code, would_execute: false },
    })
    return {
      policy: result,
      idempotencyKey,
      receipt,
      existingReceipt: existing,
      lockKey: `exec:${idempotencyKey}`,
      reservationId: null,
      blockStatus: 'prepare_only',
      blockSummary: result.reason,
      dryRun: Boolean(receipt.dry_run),
      shadow: Boolean(receipt.shadow),
      rollbackNote: rollback.note,
    }
  }

  // Merge with permission: policy can only tighten
  if (result.decision === 'APPROVAL_REQUIRED' || input.permissionMode === 'require_approval') {
    if (!input.approvedExecution) {
      const receipt = await createExecutionReceipt({
        toolName: input.toolName,
        system: result.system,
        actionClass: result.action_class,
        idempotencyKey,
        status: 'approval_required',
        policyDecision: 'APPROVAL_REQUIRED',
        policyReason: result.reason,
        estimatedCostUsd: input.estimatedCostUsd,
        toolCallId: input.toolCallId,
        taskId: input.taskId,
        adminUserId: input.actorId,
        targetType: target.target_type,
        targetId: target.target_id,
        metadata: { code: result.code },
      })
      return {
        policy: { ...result, decision: 'APPROVAL_REQUIRED' },
        idempotencyKey,
        receipt,
        existingReceipt: existing,
        lockKey: `exec:${idempotencyKey}`,
        reservationId: null,
        blockStatus: 'requires_approval',
        blockSummary: result.reason,
        dryRun: config.dry_run,
        shadow: config.shadow_mode,
        rollbackNote: rollback.note,
      }
    }
  }

  // AUTO_EXECUTE path — lock + reserve
  const lockKey = `exec:${result.system}:${target.target_id || input.toolName}:${idempotencyKey.slice(0, 16)}`
  const lock = await acquireExecutionLock({
    lockKey,
    owner: input.toolCallId || input.actorId || idempotencyKey,
  })
  if (!lock.ok) {
    return {
      policy: {
        ...result,
        decision: 'BLOCKED',
        code: 'DUPLICATE',
        reason: lock.reason || 'Lock unavailable',
      },
      idempotencyKey,
      receipt: null,
      existingReceipt: existing,
      lockKey,
      reservationId: null,
      blockStatus: 'blocked',
      blockSummary: lock.reason || 'Concurrent lock',
      dryRun: config.dry_run,
      shadow: config.shadow_mode,
      rollbackNote: rollback.note,
    }
  }

  // Only reserve auto-capacity for non-approved autonomous path
  let reservationId: string | null = null
  if (!input.approvedExecution && facts.autonomy_level >= 3) {
    const reserved = await reserveExecutionCapacity({
      estimatedCostUsd: input.estimatedCostUsd,
      limits: config.limits,
      toolName: input.toolName,
      system: result.system,
    })
    if (!reserved.ok) {
      return {
        policy: {
          ...result,
          decision: 'BLOCKED',
          code: reserved.code === 'RATE_LIMIT' ? 'RATE_LIMIT' : 'BUDGET',
          reason: reserved.reason,
        },
        idempotencyKey,
        receipt: null,
        existingReceipt: existing,
        lockKey,
        reservationId: null,
        blockStatus: 'budget_exhausted',
        blockSummary: reserved.reason,
        dryRun: config.dry_run,
        shadow: config.shadow_mode,
        rollbackNote: rollback.note,
      }
    }
    reservationId = reserved.reservationId
  }

  const receipt = await createExecutionReceipt({
    toolName: input.toolName,
    system: result.system,
    actionClass: result.action_class,
    idempotencyKey,
    status: 'reserved',
    policyDecision: 'AUTO_EXECUTE',
    policyReason: result.reason,
    estimatedCostUsd: input.estimatedCostUsd,
    toolCallId: input.toolCallId,
    taskId: input.taskId,
    adminUserId: input.actorId,
    targetType: target.target_type,
    targetId: target.target_id,
    metadata: { reservation_id: reservationId, rollback: rollback.note },
  })

  return {
    policy: result,
    idempotencyKey,
    receipt,
    existingReceipt: existing,
    lockKey,
    reservationId,
    dryRun: false,
    shadow: false,
    rollbackNote: rollback.note,
  }
}
