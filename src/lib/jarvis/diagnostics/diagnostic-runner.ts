import { DiagnosticBudgetTracker } from './diagnostic-budget'
import type { DiagnosticStage, DiagnosticStep } from './diagnostic-types'

export class DiagnosticRunner {
  readonly budget: DiagnosticBudgetTracker
  readonly steps: DiagnosticStep[] = []
  readonly stages: DiagnosticStage[] = []

  constructor(budget = new DiagnosticBudgetTracker()) {
    this.budget = budget
  }

  async step<T>(stage: DiagnosticStage, name: string, fn: () => Promise<T> | T): Promise<T | null> {
    const gate = this.budget.consumeStep(name)
    if (!gate.ok) {
      this.steps.push({
        n: this.budget.steps,
        stage,
        name,
        status: 'budget_exhausted',
        summary: gate.reason || 'budget exhausted',
        at: new Date().toISOString(),
      })
      return null
    }
    try {
      const result = await fn()
      this.stages.push(stage)
      this.steps.push({
        n: this.budget.steps,
        stage,
        name,
        status: 'ok',
        summary: name,
        at: new Date().toISOString(),
      })
      return result
    } catch (err) {
      this.steps.push({
        n: this.budget.steps,
        stage,
        name,
        status: 'failed',
        summary: err instanceof Error ? err.message : 'step failed',
        at: new Date().toISOString(),
      })
      return null
    }
  }
}
