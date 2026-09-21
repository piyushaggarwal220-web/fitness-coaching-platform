import type { RemediationKind, RemediationPermission } from './diagnostic-types'

const AUTO: RemediationKind[] = [
  'retry_transient',
  'refresh_token',
  'refresh_cached_state',
  'invalidate_cache',
  'requeue_job',
  'rebuild_derived_analytics',
  'retry_research',
]

const APPROVAL: RemediationKind[] = [
  'code_change',
  'schema_migration',
  'change_scopes',
  'change_permissions',
  'change_production_config',
  'change_meta_campaigns',
  'change_shopify_data',
  'deployment',
  'change_cost_limits',
]

const FORBIDDEN: RemediationKind[] = ['weaken_security']

export function evaluateRemediationPermission(kind: RemediationKind): RemediationPermission {
  if (FORBIDDEN.includes(kind)) return 'forbidden'
  if (APPROVAL.includes(kind)) return 'require_approval'
  if (AUTO.includes(kind)) return 'auto'
  return 'require_approval'
}

export function isSafeDiagnosticAction(action: string): boolean {
  return [
    'read_logs',
    'inspect_database',
    'inspect_api',
    'inspect_tool_output',
    'inspect_schema',
    'inspect_config',
    'run_non_destructive_test',
    'retry_transient',
    'refresh_token',
    'invalidate_cache',
    'requeue_job',
  ].includes(action)
}

export function isForbiddenSelfHeal(action: string): boolean {
  return [
    'disable_security',
    'weaken_validation',
    'remove_audit_logging',
    'bypass_approval',
    'expose_secrets',
    'print_credentials',
    'silent_permission_change',
    'silent_deploy',
    'silent_production_data_change',
  ].includes(action)
}

export async function applySafeRemediation(kind: RemediationKind): Promise<{
  ok: boolean
  applied: boolean
  summary: string
}> {
  const permission = evaluateRemediationPermission(kind)
  if (permission === 'forbidden') {
    return { ok: false, applied: false, summary: 'Forbidden remediation refused.' }
  }
  if (permission === 'require_approval') {
    return {
      ok: true,
      applied: false,
      summary: 'Significant remediation requires explicit owner approval.',
    }
  }

  if (kind === 'refresh_token' || kind === 'refresh_cached_state' || kind === 'invalidate_cache') {
    const { resetShopifyAuthCache } = await import('@/lib/jarvis/shopify/client')
    resetShopifyAuthCache()
    return { ok: true, applied: true, summary: 'Refreshed cached Shopify auth/integration state.' }
  }

  if (kind === 'retry_transient' || kind === 'retry_research') {
    return { ok: true, applied: true, summary: 'Safe retry authorized. Caller may re-run the probe.' }
  }

  if (kind === 'requeue_job') {
    return {
      ok: true,
      applied: false,
      summary: 'Requeue is allowed but needs a specific job id from the diagnostic run.',
    }
  }

  if (kind === 'rebuild_derived_analytics') {
    return {
      ok: true,
      applied: false,
      summary: 'Rebuild of derived analytics is allowed as a non-destructive refresh; not executed without a target.',
    }
  }

  return { ok: false, applied: false, summary: `Unhandled safe kind ${kind}.` }
}
