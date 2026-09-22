/**
 * Post-write verification — re-read provider state; never assume success.
 */

import type { ToolExecutionContext } from '@/lib/jarvis/types'

export type WriteVerificationState =
  | 'VERIFIED'
  | 'EXECUTED_UNVERIFIED'
  | 'FAILED'
  | 'NOT_APPLICABLE'
  | 'RECORDED_NOT_EXECUTED'
  | 'SKIPPED'

export type WriteVerificationResult = {
  state: WriteVerificationState
  tool: string
  summary: string
  observed?: Record<string, unknown>
  error?: string
}

function outputFlag(output: unknown, key: string): unknown {
  if (!output || typeof output !== 'object') return undefined
  return (output as Record<string, unknown>)[key]
}

/**
 * Verify significant writes using the tool's own result shape and optional re-reads.
 * Does not invent success. If provider says recorded_not_executed, report that honestly.
 */
export async function verifyAfterWrite(input: {
  toolName: string
  riskClass: string
  output: unknown
  ctx: ToolExecutionContext
}): Promise<WriteVerificationResult> {
  const { toolName, riskClass, output } = input

  if (riskClass === 'READ') {
    return {
      state: 'NOT_APPLICABLE',
      tool: toolName,
      summary: 'Read tool — verification not required',
    }
  }

  // Honest short-circuit when live flags blocked execution
  const status = String(outputFlag(output, 'status') || outputFlag(output, 'execution') || '')
  const recorded =
    status === 'recorded_not_executed' ||
    outputFlag(output, 'recorded_not_executed') === true ||
    outputFlag(output, 'live_execution') === false

  if (recorded) {
    return {
      state: 'RECORDED_NOT_EXECUTED',
      tool: toolName,
      summary:
        'Provider path recorded intent but did not perform a live external write (live flag off or policy).',
      observed: typeof output === 'object' && output ? (output as Record<string, unknown>) : {},
    }
  }

  const ok =
    outputFlag(output, 'ok') === true ||
    outputFlag(output, 'success') === true ||
    status === 'ok' ||
    status === 'executed' ||
    status === 'completed' ||
    status === 'done'

  const failed =
    outputFlag(output, 'ok') === false ||
    outputFlag(output, 'success') === false ||
    status === 'failed' ||
    status === 'error'

  if (failed) {
    return {
      state: 'FAILED',
      tool: toolName,
      summary: String(outputFlag(output, 'error') || outputFlag(output, 'message') || 'Write failed'),
      observed: typeof output === 'object' && output ? (output as Record<string, unknown>) : {},
      error: String(outputFlag(output, 'error') || 'failed'),
    }
  }

  // Tool-specific verification hooks (reuse existing READ tools / client helpers)
  try {
    if (toolName.startsWith('meta.')) {
      const { loadMetaIntegrationStatus } = await import(
        '@/lib/jarvis/diagnostics/meta-sync-pipeline'
      )
      const meta = await loadMetaIntegrationStatus()
      const budget =
        outputFlag(output, 'new_budget') ??
        outputFlag(output, 'daily_budget') ??
        outputFlag(output, 'budget')
      const verifiedField = outputFlag(output, 'verified') ?? outputFlag(output, 'provider_confirmed')
      if (verifiedField === true || ok) {
        return {
          state: verifiedField === true ? 'VERIFIED' : 'EXECUTED_UNVERIFIED',
          tool: toolName,
          summary:
            verifiedField === true
              ? `Meta write accepted and marked verified${budget != null ? ` (budget field ${String(budget)})` : ''}.`
              : `Meta write returned success but final object state was not re-confirmed. Live=${meta.configured}.`,
          observed: {
            meta_configured: meta.configured,
            lastSyncAt: meta.lastSyncAt,
            result: typeof output === 'object' ? output : { raw: output },
          },
        }
      }
    }

    if (toolName.startsWith('shopify.')) {
      const productId = outputFlag(output, 'product_id') || outputFlag(output, 'id')
      if (productId && typeof productId === 'string') {
        const { shopifyGetProduct } = await import('@/lib/jarvis/shopify/client')
        if (typeof shopifyGetProduct === 'function') {
          const fresh = await shopifyGetProduct(productId).catch(() => null)
          if (fresh) {
            return {
              state: 'VERIFIED',
              tool: toolName,
              summary: `Shopify product ${productId} re-read after write.`,
              observed: { product: fresh },
            }
          }
        }
      }
      return {
        state: ok ? 'EXECUTED_UNVERIFIED' : 'FAILED',
        tool: toolName,
        summary: ok
          ? 'Shopify write returned success but product re-read was skipped or failed.'
          : 'Shopify write did not report success.',
        observed: typeof output === 'object' && output ? (output as Record<string, unknown>) : {},
      }
    }

    if (toolName.startsWith('instagram.')) {
      const published = outputFlag(output, 'published') === true
      const mediaId = outputFlag(output, 'media_id') || outputFlag(output, 'id')
      if (published && mediaId) {
        return {
          state: 'VERIFIED',
          tool: toolName,
          summary: `Instagram publish confirmed with media id ${String(mediaId)}.`,
          observed: { media_id: mediaId },
        }
      }
      if (liveOff(output)) {
        return {
          state: 'RECORDED_NOT_EXECUTED',
          tool: toolName,
          summary: 'Instagram publishing disabled or not executed live.',
          observed: typeof output === 'object' && output ? (output as Record<string, unknown>) : {},
        }
      }
      return {
        state: ok ? 'EXECUTED_UNVERIFIED' : 'FAILED',
        tool: toolName,
        summary: ok
          ? 'Instagram write returned success without confirmed media id.'
          : 'Instagram write failed.',
        observed: typeof output === 'object' && output ? (output as Record<string, unknown>) : {},
      }
    }

    if (toolName.startsWith('video.')) {
      const jobStatus = String(outputFlag(output, 'status') || '')
      const providerJobId = outputFlag(output, 'provider_job_id') || outputFlag(output, 'render_id')
      if (jobStatus === 'completed' || jobStatus === 'done') {
        return {
          state: 'VERIFIED',
          tool: toolName,
          summary: `Video job completed${providerJobId ? ` (${String(providerJobId)})` : ''}.`,
          observed: typeof output === 'object' && output ? (output as Record<string, unknown>) : {},
        }
      }
      if (ok || jobStatus === 'rendering' || jobStatus === 'queued' || jobStatus === 'processing') {
        return {
          state: 'EXECUTED_UNVERIFIED',
          tool: toolName,
          summary: `Video job accepted with status=${jobStatus || 'unknown'} — not yet completed.`,
          observed: typeof output === 'object' && output ? (output as Record<string, unknown>) : {},
        }
      }
    }
  } catch (err) {
    return {
      state: 'EXECUTED_UNVERIFIED',
      tool: toolName,
      summary: `Write ran but verification errored: ${err instanceof Error ? err.message : 'unknown'}`,
      error: err instanceof Error ? err.message : 'verify failed',
    }
  }

  if (ok) {
    return {
      state: 'EXECUTED_UNVERIFIED',
      tool: toolName,
      summary: 'Write reported success; no dedicated re-read confirmation available.',
      observed: typeof output === 'object' && output ? (output as Record<string, unknown>) : {},
    }
  }

  return {
    state: 'SKIPPED',
    tool: toolName,
    summary: 'No verification rule matched for this tool.',
  }
}

function liveOff(output: unknown): boolean {
  return (
    outputFlag(output, 'live_publishing_enabled') === false ||
    outputFlag(output, 'published') === false &&
      (outputFlag(output, 'status') === 'recorded_not_executed' ||
        outputFlag(output, 'blocked') === true)
  )
}

export function formatVerificationForOperator(v: WriteVerificationResult): string {
  switch (v.state) {
    case 'VERIFIED':
      return `VERIFIED: ${v.summary}`
    case 'EXECUTED_UNVERIFIED':
      return `EXECUTED (unverified): ${v.summary}`
    case 'RECORDED_NOT_EXECUTED':
      return `RECORDED_NOT_EXECUTED: ${v.summary}`
    case 'FAILED':
      return `FAILED: ${v.summary}`
    default:
      return `${v.state}: ${v.summary}`
  }
}
