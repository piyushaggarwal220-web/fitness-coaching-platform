/** Types for the Jarvis self-diagnostic business operator. */

export type DataStatus =
  | 'verified'
  | 'partial'
  | 'stale'
  | 'unavailable'
  | 'failed'
  | 'unknown'

export type HealthStatus = 'healthy' | 'degraded' | 'failed' | 'not_configured' | 'unknown'

export type DiagnosticStage =
  | 'observe'
  | 'detect'
  | 'investigate'
  | 'diagnose'
  | 'propose_fix'
  | 'permission_check'
  | 'apply_fix'
  | 'test'
  | 'verify'
  | 'learn'

export type IncidentStatus =
  | 'open'
  | 'investigating'
  | 'diagnosed'
  | 'awaiting_approval'
  | 'approved'
  | 'applying'
  | 'testing'
  | 'resolved'
  | 'wont_fix'
  | 'budget_exhausted'
  | 'failed'

export type RemediationKind =
  | 'retry_transient'
  | 'refresh_token'
  | 'refresh_cached_state'
  | 'invalidate_cache'
  | 'requeue_job'
  | 'rebuild_derived_analytics'
  | 'retry_research'
  | 'code_change'
  | 'schema_migration'
  | 'change_scopes'
  | 'change_permissions'
  | 'change_production_config'
  | 'change_meta_campaigns'
  | 'change_shopify_data'
  | 'deployment'
  | 'change_cost_limits'
  | 'weaken_security'

export type RemediationPermission = 'auto' | 'require_approval' | 'forbidden'

export type DiagnosticRisk = 'low' | 'medium' | 'high' | 'critical'

export type ModelTaskType =
  | 'chat'
  | 'plan'
  | 'diagnostic'
  | 'research'
  | 'creative'
  | 'analysis'

export type ModelComplexity = 'simple' | 'standard' | 'complex' | 'ambiguous'

export type ProvenancePeriod = {
  start: string
  end: string
  label?: string
}

export type MetricProvenance = {
  metric: string
  value: number | null
  currency?: string | null
  period?: ProvenancePeriod | null
  timezone: string
  source: string
  source_timestamp: string
  query_period?: ProvenancePeriod | null
  tool_name?: string | null
  request_id?: string | null
  data_status: DataStatus
  confidence: 'low' | 'medium' | 'high'
  calculation_method: string
  sample_limit?: number | null
  note?: string
}

export type HealthCheckResult = {
  id: string
  name: string
  status: HealthStatus
  summary: string
  checked_at: string
  details?: Record<string, unknown>
  deeper?: { name: string; status: HealthStatus; summary: string }[]
}

export type DiagnosticEvidence = {
  id: string
  stage: DiagnosticStage
  system: string
  observation: string
  data_status?: DataStatus
  payload?: unknown
  at: string
}

export type DiagnosticFinding = {
  id: string
  title: string
  severity: DiagnosticRisk
  data_status?: DataStatus
  detail: string
  system: string
}

export type ProposedRemediation = {
  id: string
  kind: RemediationKind
  title: string
  description: string
  risk: DiagnosticRisk
  permission: RemediationPermission
  test_plan: string[]
  files?: string[]
  current_state?: Record<string, unknown>
  proposed_state?: Record<string, unknown>
}

export type DiagnosticStep = {
  n: number
  stage: DiagnosticStage
  name: string
  status: 'ok' | 'failed' | 'skipped' | 'budget_exhausted'
  summary: string
  at: string
}

export type RootCauseResult = {
  summary: string
  confidence: 'low' | 'medium' | 'high'
  pipeline_break?: string | null
  findings: DiagnosticFinding[]
  cannot_conclude_business?: boolean
}

export type DiagnosticBudget = {
  maxSteps: number
  maxToolCalls: number
  maxRuntimeMs: number
  maxTokens: number
  maxResearchSearches: number
  maxRetries: number
  spentUsdCap: number
}

export const DEFAULT_DIAGNOSTIC_BUDGET: DiagnosticBudget = {
  maxSteps: 16,
  maxToolCalls: 10,
  maxRuntimeMs: 45_000,
  maxTokens: 8_000,
  maxResearchSearches: 0,
  maxRetries: 2,
  spentUsdCap: 0.25,
}

export type DiagnosticRunInput = {
  problem: string
  userRequest?: string | null
  actorId?: string | null
  conversationId?: string | null
  taskId?: string | null
  persist?: boolean
  budget?: Partial<DiagnosticBudget>
}

export type DiagnosticReport = {
  incident_id: string
  db_id?: string | null
  detected_at: string
  system: string
  user_request: string
  symptom: string
  stages_completed: DiagnosticStage[]
  diagnostic_steps: DiagnosticStep[]
  evidence: DiagnosticEvidence[]
  findings: DiagnosticFinding[]
  root_cause: RootCauseResult | null
  proposed_fix: ProposedRemediation[]
  approval_id?: string | null
  approval_required: boolean
  applied_fixes: string[]
  verification: Record<string, unknown> | null
  resolution: string | null
  status: IncidentStatus
  memory_id?: string | null
  regression_tests: { name: string; assertion: string }[]
  budget_exhausted: boolean
  model: string
  data_status: DataStatus
}

export type ToolContractAnomaly =
  | 'null_undefined'
  | 'impossible_value'
  | 'unexpected_zero'
  | 'api_error'
  | 'stale_timestamp'
  | 'schema_mismatch'
  | 'hidden_failure'

export type ToolContractResult = {
  tool: string
  input_valid: boolean
  executed: boolean
  output_valid: boolean
  data_status: DataStatus
  anomalies: { type: ToolContractAnomaly; detail: string }[]
  summary: string
  output?: unknown
}

export type GraphqlInspectResult = {
  http_status: number
  http_ok: boolean
  graphql_ok: boolean
  errors: { message: string }[]
  data: unknown
  data_status: DataStatus
  request_id: string | null
}
