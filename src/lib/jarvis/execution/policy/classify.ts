/**
 * Map tool names → action class + system (structured, not LLM prose).
 *
 * Architecture rule:
 *   REGISTERED tool riskClass (registry) > legacy name heuristics
 *   Explicit READ → action_class READ (never UNKNOWN)
 *   Unregistered / UNKNOWN remains subject to safety policy
 */

import type { ActionClass, ExecutionSystem, Reversibility } from '@/lib/jarvis/execution/policy/types'
import { getTool } from '@/lib/jarvis/tools/registry'

export function systemForTool(toolName: string): ExecutionSystem {
  const root = toolName.split('.')[0] || ''
  switch (root) {
    case 'meta':
      return 'META'
    case 'instagram':
      return 'INSTAGRAM'
    case 'shopify':
      return 'SHOPIFY'
    case 'video':
      return 'VIDEO'
    case 'content':
    case 'content_ops':
      return 'CONTENT'
    case 'research':
      return 'RESEARCH'
    case 'system':
    case 'diagnostics':
    case 'execution':
      return 'SYSTEM'
    default:
      return 'OTHER'
  }
}

function alwaysBlockedName(t: string): ActionClass | null {
  if (t.includes('payment') || t.includes('billing')) return 'PAYMENT_CONFIGURATION'
  if (t.includes('credential')) return 'SECURITY_CONFIGURATION'
  if (t.startsWith('system.') || t.includes('permission') || t.includes('raise_budget') || t.includes('disable_audit')) {
    return 'SYSTEM_CONFIGURATION'
  }
  return null
}

/** Name-based write classes that must never be softened by READ heuristics. */
function alwaysApprovalWriteClass(t: string): ActionClass | null {
  if (t.includes('increase_budget') || t.includes('budget_increase')) return 'AD_BUDGET_INCREASE'
  if (t.includes('decrease_budget') || t.includes('budget_decrease')) return 'AD_BUDGET_DECREASE'
  if (t.includes('pause') && t.startsWith('meta.')) return 'AD_PAUSE'
  if ((t.includes('resume') || t.includes('enable') || t.includes('activate')) && t.startsWith('meta.')) return 'AD_ENABLE'
  if (t.includes('create') && t.startsWith('meta.')) return 'AD_CREATE'
  if (t.startsWith('meta.') && (t.includes('push') || t.includes('update'))) return 'AD_UPDATE'

  if (t.includes('prepare_publish') || (t.includes('prepare') && t.includes('publish'))) return null // handled as PREPARE
  if (t.includes('publish') && (t.startsWith('instagram.') || t.includes('content'))) return 'CONTENT_PUBLISH'
  if (t.includes('schedule')) return 'CONTENT_SCHEDULE'

  if (t.startsWith('shopify.') && (t.includes('update_price') || t.includes('.price'))) return 'SHOPIFY_PRICE_UPDATE'
  if (t.startsWith('shopify.') && (t.includes('update_status') || t.endsWith('.status_update'))) return 'SHOPIFY_STATUS_UPDATE'
  if (t.startsWith('shopify.') && (t.includes('update_image') || t.includes('.image'))) return 'SHOPIFY_IMAGE_UPDATE'
  if (t.startsWith('shopify.') && (t.includes('update') || t.includes('write')) && !t.includes('list') && !t.includes('get')) {
    return 'SHOPIFY_CONTENT_UPDATE'
  }

  if (t.includes('video') && t.includes('publish')) return 'VIDEO_PUBLISH'
  if (t.includes('render')) return 'VIDEO_RENDER'

  return null
}

function softActionFromName(t: string): ActionClass {
  if (t.includes('prepare_publish') || (t.includes('prepare') && t.includes('publish'))) return 'PREPARE'
  if (
    /\banaly[sz]e\b/.test(t) ||
    t.includes('.analy') ||
    t.includes('diagnos') ||
    t.includes('investigat') ||
    t.includes('analyze_')
  ) {
    return 'ANALYZE'
  }
  if (t.includes('research') || t.startsWith('research.')) return 'RESEARCH'
  if (t.includes('generate') || t.includes('draft') || t.includes('idea') || t === 'memory.remember') return 'GENERATE'
  if (t.includes('prepare') || t.includes('preview') || t.includes('plan')) return 'PREPARE'
  if (t.startsWith('instagram.') || t.startsWith('content.') || t.startsWith('creative.')) {
    if (t.includes('draft') || t.includes('generate') || t.includes('idea') || t.includes('plan') || t.includes('remember')) {
      return 'GENERATE'
    }
    if (t.includes('save') || t.includes('write') || t.includes('handoff') || t.includes('watchlist')) {
      return 'CONTENT_WRITE'
    }
  }
  if (
    t.includes('.get') ||
    t.includes('.list') ||
    t.endsWith('.status') ||
    t.includes('.sync') ||
    t.includes('overview') ||
    t.includes('snapshot') ||
    t.includes('revenue') ||
    t.includes('insights') ||
    t.includes('performance') ||
    t.includes('engagement') ||
    t.includes('read')
  ) {
    return 'READ'
  }
  return 'UNKNOWN'
}

export function classifyToolAction(toolName: string): {
  action_class: ActionClass
  reversibility: Reversibility
  require_verification: boolean
} {
  const t = toolName.toLowerCase()

  const blocked = alwaysBlockedName(t)
  if (blocked) {
    return { action_class: blocked, reversibility: 'NOT_REVERSIBLE', require_verification: true }
  }

  // Hard write classes from name (Meta money, publish, Shopify mutations) — before registry READ.
  const writeClass = alwaysApprovalWriteClass(t)
  if (writeClass) {
    const reversible =
      writeClass === 'CONTENT_PUBLISH' || writeClass === 'VIDEO_PUBLISH' ? 'NOT_REVERSIBLE' : 'REVERSIBLE'
    const partial =
      writeClass === 'AD_CREATE' || writeClass === 'AD_UPDATE' || writeClass === 'VIDEO_RENDER'
        ? 'PARTIALLY_REVERSIBLE'
        : reversible
    return {
      action_class: writeClass,
      reversibility: partial as Reversibility,
      require_verification: true,
    }
  }

  if (t.includes('prepare_publish') || (t.includes('prepare') && t.includes('publish'))) {
    return { action_class: 'PREPARE', reversibility: 'REVERSIBLE', require_verification: false }
  }

  // ── Registry is the source of truth for registered tools ──────────────
  const registered = getTool(toolName)
  if (registered?.riskClass === 'READ') {
    return { action_class: 'READ', reversibility: 'REVERSIBLE', require_verification: false }
  }
  if (registered?.riskClass === 'DANGEROUS') {
    return { action_class: 'SECURITY_CONFIGURATION', reversibility: 'NOT_REVERSIBLE', require_verification: true }
  }
  if (registered?.riskClass === 'SIGNIFICANT') {
    // Keep significant tools out of READ heuristics; name soft-class still helps labeling.
    const soft = softActionFromName(t)
    if (soft === 'READ' || soft === 'UNKNOWN') {
      // Significant but not matched as a known write class — still require verification.
      return { action_class: 'UNKNOWN', reversibility: 'NOT_REVERSIBLE', require_verification: true }
    }
    return { action_class: soft, reversibility: 'REVERSIBLE', require_verification: true }
  }
  if (registered?.riskClass === 'LOW_RISK') {
    const soft = softActionFromName(t)
    const action_class: ActionClass =
      soft === 'UNKNOWN' || soft === 'READ' ? 'GENERATE' : soft
    return { action_class, reversibility: 'REVERSIBLE', require_verification: false }
  }

  // Unregistered — heuristics only. UNKNOWN stays unsafe.
  const soft = softActionFromName(t)
  if (soft !== 'UNKNOWN') {
    return {
      action_class: soft,
      reversibility: 'REVERSIBLE',
      require_verification: soft === 'ANALYZE' || soft === 'READ' ? false : false,
    }
  }

  return { action_class: 'UNKNOWN', reversibility: 'NOT_REVERSIBLE', require_verification: true }
}

/** Action classes that may auto-execute at autonomy ≥ 3 when all other gates pass. */
export const GUARDED_AUTO_CLASSES = new Set<ActionClass>([
  'READ',
  'ANALYZE',
  'RESEARCH',
  'GENERATE',
  'PREPARE',
  'CONTENT_WRITE',
  'VIDEO_RENDER',
  'SHOPIFY_CONTENT_UPDATE',
])

/** Always approval (never auto) even at Level 4 unless explicitly overridden later. */
export const ALWAYS_APPROVAL_CLASSES = new Set<ActionClass>([
  'AD_BUDGET_INCREASE',
  'AD_BUDGET_DECREASE',
  'AD_PAUSE',
  'AD_ENABLE',
  'AD_CREATE',
  'AD_UPDATE',
  'CONTENT_PUBLISH',
  'CONTENT_SCHEDULE',
  'SHOPIFY_PRICE_UPDATE',
  'SHOPIFY_STATUS_UPDATE',
  'SHOPIFY_IMAGE_UPDATE',
  'VIDEO_PUBLISH',
])

export const ALWAYS_BLOCKED_CLASSES = new Set<ActionClass>([
  'PAYMENT_CONFIGURATION',
  'SECURITY_CONFIGURATION',
  'SYSTEM_CONFIGURATION',
])
