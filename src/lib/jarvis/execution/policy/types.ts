/**
 * Phase 12 — Controlled execution types.
 * Policy decides; LLM proposes. Never inverted.
 */

export type ExecutionDecision =
  | 'AUTO_EXECUTE'
  | 'APPROVAL_REQUIRED'
  | 'PREPARE_ONLY'
  | 'BLOCKED'

export type ExecutionMode = 'approval' | 'guarded' | 'shadow' | 'dry_run'

export type ActionClass =
  | 'READ'
  | 'ANALYZE'
  | 'RESEARCH'
  | 'GENERATE'
  | 'PREPARE'
  | 'CONTENT_WRITE'
  | 'CONTENT_SCHEDULE'
  | 'CONTENT_PUBLISH'
  | 'AD_BUDGET_INCREASE'
  | 'AD_BUDGET_DECREASE'
  | 'AD_PAUSE'
  | 'AD_ENABLE'
  | 'AD_CREATE'
  | 'AD_UPDATE'
  | 'SHOPIFY_CONTENT_UPDATE'
  | 'SHOPIFY_PRICE_UPDATE'
  | 'SHOPIFY_STATUS_UPDATE'
  | 'SHOPIFY_IMAGE_UPDATE'
  | 'VIDEO_RENDER'
  | 'VIDEO_PUBLISH'
  | 'SYSTEM_CONFIGURATION'
  | 'SECURITY_CONFIGURATION'
  | 'PAYMENT_CONFIGURATION'
  | 'UNKNOWN'

export type ExecutionSystem =
  | 'META'
  | 'INSTAGRAM'
  | 'SHOPIFY'
  | 'VIDEO'
  | 'CONTENT'
  | 'RESEARCH'
  | 'SYSTEM'
  | 'OTHER'

export type Reversibility = 'REVERSIBLE' | 'PARTIALLY_REVERSIBLE' | 'NOT_REVERSIBLE'

export type ErrorClass =
  | 'TRANSIENT'
  | 'AUTH'
  | 'RATE_LIMIT'
  | 'VALIDATION'
  | 'PERMISSION'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'PROVIDER'
  | 'UNKNOWN'

export type ReceiptStatus =
  | 'proposed'
  | 'policy_checked'
  | 'approval_required'
  | 'reserved'
  | 'executing'
  | 'dry_run'
  | 'shadow'
  | 'executed'
  | 'verified'
  | 'verification_failed'
  | 'failed'
  | 'blocked'
  | 'rolled_back'
  | 'cancelled'

export type ExecutionLimits = {
  max_auto_action_cost_usd: number
  max_auto_daily_action_cost_usd: number
  max_auto_monthly_action_cost_usd: number
  max_auto_actions_per_hour: number
  max_auto_actions_per_day: number
  max_auto_meta_budget_change_percent: number
  max_auto_shopify_price_change_percent: number
  max_auto_content_publishes_per_day: number
  max_auto_video_render_cost_usd: number
  approval_ttl_hours: number
}

export type PolicyFacts = {
  tool_name: string
  action_class: ActionClass
  system: ExecutionSystem
  risk_class: string
  risk_level: string
  estimated_cost_usd: number
  money_impact_usd: number | null
  percent_change: number | null
  autonomy_level: number
  source: 'chat' | 'cron' | 'event' | 'system'
  approved_execution: boolean
  live_meta_enabled: boolean
  live_instagram_publishing: boolean
  shopify_writes_enabled: boolean
  video_publish_enabled: boolean
  execution_kill_switch: boolean
  execution_mode: ExecutionMode
  dry_run: boolean
  shadow_mode: boolean
  canary_enabled: boolean
  reversibility: Reversibility
  recent_failures: number
  duplicate_running: boolean
  already_succeeded: boolean
}

export type PolicyResult = {
  decision: ExecutionDecision
  reason: string
  code:
    | 'OK'
    | 'KILL_SWITCH'
    | 'AUTONOMY_LEVEL'
    | 'ENVIRONMENT_FLAG'
    | 'RISK_CLASS'
    | 'ACTION_CLASS'
    | 'BUDGET'
    | 'RATE_LIMIT'
    | 'DUPLICATE'
    | 'ALREADY_DONE'
    | 'DRY_RUN'
    | 'SHADOW'
    | 'CANARY_REQUIRED'
    | 'FORBIDDEN'
    | 'BLOCKED_DEFAULT'
  action_class: ActionClass
  system: ExecutionSystem
  require_verification: boolean
  require_receipt: boolean
}

export type ExecutionReceipt = {
  id: string
  action_id: string | null
  task_id: string | null
  decision_id: string | null
  tool_call_id: string | null
  admin_user_id: string | null
  system: ExecutionSystem
  action_class: ActionClass
  tool_name: string
  target_type: string | null
  target_id: string | null
  idempotency_key: string
  status: ReceiptStatus
  policy_decision: ExecutionDecision | null
  policy_reason: string | null
  estimated_cost_usd: number
  actual_cost_usd: number | null
  before_state: Record<string, unknown>
  after_state: Record<string, unknown>
  verification_status: string | null
  verification_summary: string | null
  failure_code: string | null
  failure_message: string | null
  rollback_status: string | null
  provider_reference: string | null
  dry_run: boolean
  shadow: boolean
  metadata: Record<string, unknown>
  requested_at: string
  started_at: string | null
  completed_at: string | null
  created_at: string
}
