import { DEFAULT_DIAGNOSTIC_BUDGET, type DiagnosticBudget } from './diagnostic-types'

export class DiagnosticBudgetTracker {
  readonly limits: DiagnosticBudget
  steps = 0
  toolCalls = 0
  retries = 0
  tokens = 0
  researchSearches = 0
  spentUsd = 0
  readonly startedAt = Date.now()
  exhaustedReason: string | null = null

  constructor(overrides?: Partial<DiagnosticBudget>) {
    this.limits = { ...DEFAULT_DIAGNOSTIC_BUDGET, ...overrides }
  }

  remainingMs(): number {
    return Math.max(0, this.limits.maxRuntimeMs - (Date.now() - this.startedAt))
  }

  consumeStep(name: string): { ok: boolean; reason?: string } {
    if (this.exhaustedReason) return { ok: false, reason: this.exhaustedReason }
    if (this.steps >= this.limits.maxSteps) {
      this.exhaustedReason = `Diagnostic budget exhausted before root cause could be verified (max steps ${this.limits.maxSteps} reached at "${name}").`
      return { ok: false, reason: this.exhaustedReason }
    }
    if (this.remainingMs() <= 0) {
      this.exhaustedReason =
        'Diagnostic budget exhausted before root cause could be verified (runtime limit).'
      return { ok: false, reason: this.exhaustedReason }
    }
    this.steps += 1
    return { ok: true }
  }

  consumeToolCall(): { ok: boolean; reason?: string } {
    if (this.exhaustedReason) return { ok: false, reason: this.exhaustedReason }
    if (this.toolCalls >= this.limits.maxToolCalls) {
      this.exhaustedReason =
        'Diagnostic budget exhausted before root cause could be verified (tool-call limit).'
      return { ok: false, reason: this.exhaustedReason }
    }
    this.toolCalls += 1
    return { ok: true }
  }

  consumeRetry(): { ok: boolean; reason?: string } {
    if (this.retries >= this.limits.maxRetries) {
      return { ok: false, reason: 'Retry budget exhausted.' }
    }
    this.retries += 1
    return { ok: true }
  }

  snapshot() {
    return {
      steps: this.steps,
      toolCalls: this.toolCalls,
      retries: this.retries,
      tokens: this.tokens,
      researchSearches: this.researchSearches,
      spentUsd: this.spentUsd,
      remainingMs: this.remainingMs(),
      exhausted: Boolean(this.exhaustedReason),
      reason: this.exhaustedReason,
    }
  }
}
