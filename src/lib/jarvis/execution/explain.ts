/**
 * Structured explanations for execution decisions — no invented reasons.
 */

import type { PolicyResult } from '@/lib/jarvis/execution/policy/types'
import type { ExecutionReceipt } from '@/lib/jarvis/execution/policy/types'
import { getExecutionConfig } from '@/lib/jarvis/execution/policy/config'

export async function explainExecutionDecision(input: {
  question: string
  policy?: PolicyResult | null
  receipt?: ExecutionReceipt | null
}): Promise<{ answer: string; evidence: string[] }> {
  const q = input.question.toLowerCase()
  const cfg = await getExecutionConfig()
  const evidence: string[] = []
  if (cfg.kill_switch) evidence.push('kill_switch:active')
  if (cfg.dry_run) evidence.push('mode:dry_run')
  if (cfg.shadow_mode) evidence.push('mode:shadow')
  evidence.push(`mode:${cfg.mode}`)

  if (input.policy) {
    evidence.push(`policy:${input.policy.code}`, `decision:${input.policy.decision}`)
  }
  if (input.receipt) {
    evidence.push(`receipt:${input.receipt.status}`, `tool:${input.receipt.tool_name}`)
    if (input.receipt.verification_status) {
      evidence.push(`verification:${input.receipt.verification_status}`)
    }
  }

  if (q.includes("didn't you execute") || q.includes('did not execute') || q.includes("why didn't")) {
    if (cfg.kill_switch) {
      return {
        answer: 'I did not execute because the kill switch is active. Reads continue; writes are stopped.',
        evidence,
      }
    }
    if (input.policy?.decision === 'APPROVAL_REQUIRED') {
      return {
        answer: `I did not execute because approval is required. ${input.policy.reason}`,
        evidence,
      }
    }
    if (input.policy?.decision === 'BLOCKED') {
      return { answer: `Blocked: ${input.policy.reason}`, evidence }
    }
    if (input.receipt?.dry_run) {
      return { answer: 'That was a dry-run. No external write was performed.', evidence }
    }
    if (input.receipt?.shadow) {
      return { answer: 'Shadow mode recorded the proposal only. No external write.', evidence }
    }
  }

  if (q.includes('automatically') || q.includes('auto')) {
    if (input.policy?.decision === 'AUTO_EXECUTE') {
      return {
        answer: `I executed automatically because policy allowed it: ${input.policy.reason}`,
        evidence,
      }
    }
    return {
      answer: 'I did not auto-execute. Significant and money-impacting classes still require approval.',
      evidence,
    }
  }

  if (q.includes('approval')) {
    return {
      answer: input.policy?.reason || 'Approval is required for significant external writes by default.',
      evidence,
    }
  }

  if (q.includes('succeed') || q.includes('verified') || q.includes('actually')) {
    if (input.receipt?.verification_status === 'VERIFIED') {
      return { answer: 'Verification confirmed the provider state matched the intended change.', evidence }
    }
    if (input.receipt?.verification_status === 'FAILED') {
      return {
        answer: `Verification failed: ${input.receipt.verification_summary || 'provider state mismatch'}. Treated as not successful.`,
        evidence,
      }
    }
    if (input.receipt?.status === 'dry_run') {
      return { answer: 'Dry-run only — there was no live success to verify.', evidence }
    }
  }

  if (q.includes('undo') || q.includes('rollback')) {
    return {
      answer:
        input.receipt?.rollback_status ||
        'Rollback is available only for reversible actions and itself requires policy + audit. Instagram publishes are not auto-deleted.',
      evidence,
    }
  }

  return {
    answer: input.policy?.reason || cfg.note || 'No structured execution record for that question.',
    evidence,
  }
}
