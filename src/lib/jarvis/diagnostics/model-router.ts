import { MODELS } from '@/lib/ai/config'
import type { DiagnosticRisk, ModelComplexity, ModelTaskType } from './diagnostic-types'

/**
 * Abstraction for future model routing.
 * Current behavior is unchanged: Jarvis continues to use GPT_LUNA.
 * Complex / multi-system diagnostics are marked as escalation candidates only.
 */
export function selectModel(input: {
  taskType: ModelTaskType
  complexity?: ModelComplexity
  risk?: DiagnosticRisk
  costBudget?: number
}): { model: string; reason: string; escalated: boolean } {
  const complexity = input.complexity ?? 'standard'
  const wouldEscalate =
    input.taskType === 'diagnostic' &&
    (complexity === 'complex' || complexity === 'ambiguous') &&
    input.risk !== 'low'

  return {
    model: MODELS.GPT_LUNA,
    reason: wouldEscalate
      ? 'Complex diagnostic is an escalation candidate; current config keeps GPT_LUNA.'
      : 'Current Jarvis model configuration (unchanged).',
    escalated: false,
  }
}
