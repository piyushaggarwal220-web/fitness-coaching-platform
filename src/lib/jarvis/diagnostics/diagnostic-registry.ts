import { classifyProblem, investigateShopifyRevenuePipeline } from './root-cause-engine'
import { investigateMetaSyncPipeline } from './meta-sync-pipeline'
import { runHealthChecks } from './health-checks'
import { executeSafeToolTest } from './tool-contract-tester'
import type { PipelineTrace } from './root-cause-engine'

export type DiagnosticHandler = (problem: string) => Promise<PipelineTrace>

const handlers = new Map<string, DiagnosticHandler>()

export function registerDiagnosticHandler(kind: string, handler: DiagnosticHandler) {
  handlers.set(kind, handler)
}

export function getDiagnosticHandler(kind: string): DiagnosticHandler | undefined {
  return handlers.get(kind)
}

registerDiagnosticHandler('shopify_revenue', investigateShopifyRevenuePipeline)
registerDiagnosticHandler('shopify_disconnected', investigateShopifyRevenuePipeline)
registerDiagnosticHandler('why', async (problem) => {
  const classified = classifyProblem(problem)
  if (classified.system === 'shopify') return investigateShopifyRevenuePipeline(problem)
  if (classified.system === 'meta') return investigateMetaSyncPipeline(problem)
  const health = await runHealthChecks()
  return {
    evidence: health.map((h) => ({
      id: h.id,
      stage: 'investigate' as const,
      system: h.id,
      observation: h.summary,
      data_status: h.status === 'failed' ? ('failed' as const) : h.status === 'healthy' ? ('verified' as const) : ('unknown' as const),
      payload: { status: h.status },
      at: h.checked_at,
    })),
    findings: health
      .filter((h) => h.status === 'failed' || h.status === 'degraded' || h.status === 'not_configured')
      .map((h) => ({
        id: h.id,
        title: `${h.name} ${h.status}`,
        severity: h.status === 'failed' ? ('high' as const) : ('medium' as const),
        system: h.id,
        detail: h.summary,
      })),
    remediations: [],
    root: {
      summary: 'Investigated current system health instead of answering from memory.',
      confidence: 'medium',
      pipeline_break: null,
      findings: [],
      cannot_conclude_business: false,
    },
  }
})
registerDiagnosticHandler('meta_missing', (problem) => investigateMetaSyncPipeline(problem))
registerDiagnosticHandler('tool_failure', async (problem) => {
  const match = problem.match(/([a-z]+\.[a-z0-9_]+)/i)
  const tool = match?.[1] || 'analytics.today_overview'
  const result = await executeSafeToolTest(tool, {})
  return {
    evidence: [
      {
        id: 'tool',
        stage: 'investigate',
        system: 'tools',
        observation: result.summary,
        data_status: result.data_status,
        payload: result,
        at: new Date().toISOString(),
      },
    ],
    findings: result.anomalies.map((a) => ({
      id: a.type,
      title: a.type,
      severity: a.type === 'hidden_failure' ? 'high' : 'medium',
      system: 'tools',
      detail: a.detail,
    })),
    remediations: [],
    root: {
      summary: result.summary,
      confidence: 'medium',
      pipeline_break: result.anomalies[0]?.type ?? null,
      findings: [],
      cannot_conclude_business: result.data_status === 'failed',
    },
  }
})
registerDiagnosticHandler('generic', async (problem) => {
  const classified = classifyProblem(problem)
  const handler = handlers.get(classified.kind)
  if (handler && classified.kind !== 'generic') return handler(problem)
  const health = await runHealthChecks()
  return {
    evidence: health.slice(0, 8).map((h) => ({
      id: h.id,
      stage: 'investigate' as const,
      system: h.id,
      observation: h.summary,
      at: h.checked_at,
    })),
    findings: [],
    remediations: [],
    root: {
      summary: 'Generic diagnostic ran health checks. No single pipeline break identified.',
      confidence: 'low',
      pipeline_break: null,
      findings: [],
      cannot_conclude_business: false,
    },
  }
})

export function resolveDiagnosticKind(problem: string) {
  return classifyProblem(problem).kind
}
