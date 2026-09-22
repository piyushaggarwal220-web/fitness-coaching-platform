/**
 * Centralized execution limits + kill switch / mode.
 * Env is authoritative for kill switch and live flags.
 * jarvis_settings may tighten (never loosen env kill / live flags).
 */

import { createAdminClient } from '@/lib/supabase/admin'
import type { ExecutionLimits, ExecutionMode } from '@/lib/jarvis/execution/policy/types'

export const DEFAULT_EXECUTION_LIMITS: ExecutionLimits = {
  max_auto_action_cost_usd: Number(process.env.JARVIS_MAX_AUTO_ACTION_COST_USD) || 0.5,
  max_auto_daily_action_cost_usd: Number(process.env.JARVIS_MAX_AUTO_DAILY_ACTION_COST_USD) || 5,
  max_auto_monthly_action_cost_usd: Number(process.env.JARVIS_MAX_AUTO_MONTHLY_ACTION_COST_USD) || 50,
  max_auto_actions_per_hour: Number(process.env.JARVIS_MAX_AUTO_ACTIONS_PER_HOUR) || 20,
  max_auto_actions_per_day: Number(process.env.JARVIS_MAX_AUTO_ACTIONS_PER_DAY) || 100,
  max_auto_meta_budget_change_percent:
    Number(process.env.JARVIS_MAX_AUTO_META_BUDGET_CHANGE_PERCENT) || 10,
  max_auto_shopify_price_change_percent:
    Number(process.env.JARVIS_MAX_AUTO_SHOPIFY_PRICE_CHANGE_PERCENT) || 5,
  max_auto_content_publishes_per_day:
    Number(process.env.JARVIS_MAX_AUTO_CONTENT_PUBLISHES_PER_DAY) || 2,
  max_auto_video_render_cost_usd: Number(process.env.JARVIS_MAX_AUTO_VIDEO_RENDER_COST_USD) || 2,
  approval_ttl_hours: Number(process.env.JARVIS_APPROVAL_TTL_HOURS) || 24,
}

/**
 * Kill switch: explicit false stops external writes.
 * Unset defaults to enabled so existing approved writes keep working.
 */
export function executionKillSwitchActive(): boolean {
  const env = (process.env.JARVIS_EXECUTION_ENABLED || '').trim().toLowerCase()
  if (env === 'false' || env === '0' || env === 'off') return true
  const kill = (process.env.JARVIS_EXECUTION_KILL_SWITCH || '').trim().toLowerCase()
  if (kill === 'true' || kill === '1' || kill === 'on') return true
  return false
}

export function executionModeFromEnv(): ExecutionMode {
  const m = (process.env.JARVIS_EXECUTION_MODE || 'approval').trim().toLowerCase()
  if (m === 'guarded' || m === 'shadow' || m === 'dry_run' || m === 'approval') return m
  return 'approval'
}

export function dryRunEnabled(): boolean {
  if (executionModeFromEnv() === 'dry_run') return true
  return (process.env.JARVIS_DRY_RUN || '').trim().toLowerCase() === 'true'
}

export function shadowModeEnabled(): boolean {
  if (executionModeFromEnv() === 'shadow') return true
  return (process.env.JARVIS_SHADOW_MODE || '').trim().toLowerCase() === 'true'
}

export function shopifyWritesEnabled(): boolean {
  const v = (process.env.JARVIS_SHOPIFY_WRITES_ENABLED || '').trim().toLowerCase()
  if (v === 'false' || v === '0' || v === 'off') return false
  // Default: writes allowed through existing approval path (not auto-open)
  return true
}

export function videoPublishEnabled(): boolean {
  return (process.env.JARVIS_VIDEO_PUBLISH_ENABLED || '').trim().toLowerCase() === 'true'
}

export function canaryEnabled(): boolean {
  return (process.env.JARVIS_CANARY_MODE || '').trim().toLowerCase() === 'true'
}

function asNumber(v: unknown, fallback: number): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string' && v.trim() && Number.isFinite(Number(v))) return Number(v)
  return fallback
}

function asBool(v: unknown, fallback: boolean): boolean {
  if (typeof v === 'boolean') return v
  if (v === 'true' || v === true) return true
  if (v === 'false' || v === false) return false
  return fallback
}

export type ExecutionConfigSnapshot = {
  kill_switch: boolean
  mode: ExecutionMode
  dry_run: boolean
  shadow_mode: boolean
  canary: boolean
  shopify_writes: boolean
  video_publish: boolean
  limits: ExecutionLimits
  note: string
}

export async function getExecutionConfig(): Promise<ExecutionConfigSnapshot> {
  const kill = executionKillSwitchActive()
  let settingsKill = false
  let settingsDry = false
  let settingsShadow = false
  let settingsCanary = false
  let mode = executionModeFromEnv()
  const limits = { ...DEFAULT_EXECUTION_LIMITS }

  try {
    const admin = createAdminClient()
    const { data } = await admin
      .from('jarvis_settings')
      .select('key, value')
      .in('key', [
        'execution_kill_switch',
        'execution_mode',
        'execution_dry_run',
        'execution_shadow_mode',
        'execution_canary',
        'max_auto_action_cost_usd',
        'max_auto_daily_action_cost_usd',
        'max_auto_monthly_action_cost_usd',
        'max_auto_actions_per_hour',
        'max_auto_actions_per_day',
        'approval_ttl_hours',
      ])
    const map = new Map((data ?? []).map((r) => [r.key as string, r.value]))
    settingsKill = asBool(map.get('execution_kill_switch'), false)
    const modeSetting = map.get('execution_mode')
    if (typeof modeSetting === 'string') {
      const m = modeSetting.trim().toLowerCase()
      if (m === 'guarded' || m === 'shadow' || m === 'dry_run' || m === 'approval') mode = m
    }
    settingsDry = asBool(map.get('execution_dry_run'), false)
    settingsShadow = asBool(map.get('execution_shadow_mode'), false)
    settingsCanary = asBool(map.get('execution_canary'), false)
    limits.max_auto_action_cost_usd = asNumber(
      map.get('max_auto_action_cost_usd'),
      limits.max_auto_action_cost_usd
    )
    limits.max_auto_daily_action_cost_usd = asNumber(
      map.get('max_auto_daily_action_cost_usd'),
      limits.max_auto_daily_action_cost_usd
    )
    limits.max_auto_monthly_action_cost_usd = asNumber(
      map.get('max_auto_monthly_action_cost_usd'),
      limits.max_auto_monthly_action_cost_usd
    )
    limits.max_auto_actions_per_hour = asNumber(
      map.get('max_auto_actions_per_hour'),
      limits.max_auto_actions_per_hour
    )
    limits.max_auto_actions_per_day = asNumber(
      map.get('max_auto_actions_per_day'),
      limits.max_auto_actions_per_day
    )
    limits.approval_ttl_hours = asNumber(map.get('approval_ttl_hours'), limits.approval_ttl_hours)
  } catch {
    // Missing env / table — use env defaults
  }

  const dry = dryRunEnabled() || mode === 'dry_run' || settingsDry
  const shadow = shadowModeEnabled() || mode === 'shadow' || settingsShadow

  return {
    kill_switch: kill || settingsKill,
    mode,
    dry_run: dry,
    shadow_mode: shadow,
    canary: canaryEnabled() || settingsCanary,
    shopify_writes: shopifyWritesEnabled(),
    video_publish: videoPublishEnabled(),
    limits,
    note: kill || settingsKill
      ? 'Kill switch active — external writes are blocked. Reads continue.'
      : dry
        ? 'Dry-run mode — pipeline runs without external writes.'
        : shadow
          ? 'Shadow mode — proposals recorded, no external writes.'
          : 'Execution controls active. Live Meta/Instagram still require their own env flags.',
  }
}

/** Keys Jarvis tools must never modify. */
export const PROTECTED_EXECUTION_SETTING_KEYS = new Set([
  'execution_kill_switch',
  'execution_mode',
  'execution_dry_run',
  'execution_shadow_mode',
  'execution_canary',
  'max_auto_action_cost_usd',
  'max_auto_daily_action_cost_usd',
  'max_auto_monthly_action_cost_usd',
  'max_auto_actions_per_hour',
  'max_auto_actions_per_day',
  'approval_ttl_hours',
])
