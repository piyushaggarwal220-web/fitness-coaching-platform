import { getTool } from '@/lib/jarvis/tools/registry'
import { unexpectedZero } from './provenance'
import type { DataStatus, ToolContractResult } from './diagnostic-types'
import { redactDiagnosticValue } from './redact'

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }
  return null
}

function inferDataStatus(output: unknown): DataStatus {
  const rec = asRecord(output)
  if (!rec) return output == null ? 'unavailable' : 'unknown'
  if (typeof rec.data_status === 'string') return rec.data_status as DataStatus
  if (rec.ok === false || rec.status === 'failed' || rec.error || rec.error_type) return 'failed'
  if (rec.connected === false) return 'unavailable'
  if (rec.ok === true) return 'verified'
  return 'unknown'
}

function walkNulls(value: unknown, path = 'output'): string[] {
  if (value === undefined) return [`${path} is undefined`]
  if (value === null) return [`${path} is null`]
  if (Array.isArray(value)) {
    return value.flatMap((v, i) => walkNulls(v, `${path}[${i}]`)).slice(0, 12)
  }
  return []
}

function looksStale(value: unknown): boolean {
  const rec = asRecord(value)
  const ts = rec?.as_of || rec?.source_timestamp || rec?.updated_at
  if (typeof ts !== 'string') return false
  const t = Date.parse(ts)
  if (!Number.isFinite(t)) return true
  return Date.now() - t > 48 * 3600 * 1000
}

export function inspectToolOutputContract(input: {
  tool: string
  output: unknown
  executed: boolean
  inputValid: boolean
}): ToolContractResult {
  const anomalies: ToolContractResult['anomalies'] = []
  const data_status = inferDataStatus(input.output)
  const rec = asRecord(input.output)

  if (!input.inputValid) {
    anomalies.push({ type: 'schema_mismatch', detail: 'Input failed the tool schema.' })
  }

  for (const n of walkNulls(input.output)) {
    anomalies.push({ type: 'null_undefined', detail: n })
  }

  if (data_status === 'failed' || rec?.error || rec?.error_type === 'API_ERROR') {
    anomalies.push({ type: 'api_error', detail: String(rec?.error || rec?.error_type || 'API error') })
    const zeroFields = ['revenue', 'orders', 'order_count', 'value', 'spend', 'purchases']
    for (const field of zeroFields) {
      if (rec && rec[field] === 0) {
        anomalies.push({
          type: 'unexpected_zero',
          detail: `${field}=0 on a failed/unavailable result. Failures must not become numeric zero.`,
        })
      }
    }
  }

  if (
    unexpectedZero({
      value: rec?.revenue,
      data_status,
      sourceExplicitZero: rec?.ok === true && rec?.orders === 0,
    })
  ) {
    anomalies.push({
      type: 'hidden_failure',
      detail: 'Revenue is 0 but data_status is not a verified empty result.',
    })
  }

  if (typeof rec?.revenue === 'number' && rec.revenue < 0) {
    anomalies.push({ type: 'impossible_value', detail: 'Negative revenue.' })
  }
  if (typeof rec?.orders === 'number' && rec.orders < 0) {
    anomalies.push({ type: 'impossible_value', detail: 'Negative order count.' })
  }

  if (looksStale(input.output)) {
    anomalies.push({ type: 'stale_timestamp', detail: 'Timestamp is missing or older than 48h.' })
  }

  const output_valid = anomalies.filter((a) => a.type === 'schema_mismatch' || a.type === 'hidden_failure').length === 0

  return {
    tool: input.tool,
    input_valid: input.inputValid,
    executed: input.executed,
    output_valid,
    data_status,
    anomalies,
    summary:
      anomalies.length === 0
        ? `${input.tool} contract looks clean (${data_status}).`
        : `${input.tool} contract issues: ${anomalies.map((a) => a.type).join(', ')}`,
    output: redactDiagnosticValue(input.output),
  }
}

export async function testToolContract(
  toolName: string,
  rawInput: unknown = {}
): Promise<ToolContractResult> {
  const tool = getTool(toolName)
  if (!tool) {
    return {
      tool: toolName,
      input_valid: false,
      executed: false,
      output_valid: false,
      data_status: 'unavailable',
      anomalies: [{ type: 'schema_mismatch', detail: 'Unknown tool.' }],
      summary: `Unknown tool ${toolName}`,
    }
  }

  const parsed = tool.inputSchema.safeParse(rawInput ?? {})
  if (!parsed.success) {
    return inspectToolOutputContract({
      tool: toolName,
      output: { status: 'failed', error_type: 'SCHEMA_ERROR', error: parsed.error.message },
      executed: false,
      inputValid: false,
    })
  }

  return inspectToolOutputContract({
    tool: toolName,
    output: {
      status: 'skipped_live_execute',
      note: 'Safe contract tester validates schema and output shape; live execute is opt-in.',
    },
    executed: false,
    inputValid: true,
  })
}

export async function executeSafeToolTest(
  toolName: string,
  rawInput: unknown = {}
): Promise<ToolContractResult> {
  const tool = getTool(toolName)
  if (!tool) {
    return testToolContract(toolName, rawInput)
  }
  if (tool.riskClass !== 'READ' && tool.riskClass !== 'LOW_RISK') {
    return {
      tool: toolName,
      input_valid: true,
      executed: false,
      output_valid: true,
      data_status: 'unknown',
      anomalies: [],
      summary: `${toolName} is ${tool.riskClass} — live execute skipped (approval required).`,
    }
  }
  const parsed = tool.inputSchema.safeParse(rawInput ?? {})
  if (!parsed.success) {
    return inspectToolOutputContract({
      tool: toolName,
      output: { status: 'failed', error_type: 'SCHEMA_ERROR' },
      executed: false,
      inputValid: false,
    })
  }
  try {
    const output = await tool.execute(parsed.data as never, {
      actorId: null,
      conversationId: null,
      taskId: null,
      source: 'system',
    })
    return inspectToolOutputContract({
      tool: toolName,
      output,
      executed: true,
      inputValid: true,
    })
  } catch (err) {
    return inspectToolOutputContract({
      tool: toolName,
      output: {
        status: 'failed',
        error_type: 'API_ERROR',
        error: err instanceof Error ? err.message : 'Tool execute failed',
        revenue: null,
        orders: null,
      },
      executed: true,
      inputValid: true,
    })
  }
}
