/**
 * Map tool names → action class + system (structured, not LLM prose).
 */

import type { ActionClass, ExecutionSystem, Reversibility } from '@/lib/jarvis/execution/policy/types'

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

export function classifyToolAction(toolName: string): {
  action_class: ActionClass
  reversibility: Reversibility
  require_verification: boolean
} {
  const t = toolName.toLowerCase()

  if (t.includes('payment') || t.includes('billing') || t.includes('credential')) {
    return {
      action_class: t.includes('payment') || t.includes('billing') ? 'PAYMENT_CONFIGURATION' : 'SECURITY_CONFIGURATION',
      reversibility: 'NOT_REVERSIBLE',
      require_verification: true,
    }
  }
  if (t.startsWith('system.') || t.includes('permission') || t.includes('raise_budget') || t.includes('disable_audit')) {
    return {
      action_class: 'SYSTEM_CONFIGURATION',
      reversibility: 'NOT_REVERSIBLE',
      require_verification: true,
    }
  }

  if (t.includes('increase_budget') || t.includes('budget_increase')) {
    return { action_class: 'AD_BUDGET_INCREASE', reversibility: 'REVERSIBLE', require_verification: true }
  }
  if (t.includes('decrease_budget') || t.includes('budget_decrease')) {
    return { action_class: 'AD_BUDGET_DECREASE', reversibility: 'REVERSIBLE', require_verification: true }
  }
  if (t.includes('pause')) {
    return { action_class: 'AD_PAUSE', reversibility: 'REVERSIBLE', require_verification: true }
  }
  if (t.includes('resume') || t.includes('enable') || t.includes('activate')) {
    return { action_class: 'AD_ENABLE', reversibility: 'REVERSIBLE', require_verification: true }
  }
  if (t.includes('create') && t.startsWith('meta.')) {
    return { action_class: 'AD_CREATE', reversibility: 'PARTIALLY_REVERSIBLE', require_verification: true }
  }
  if (t.startsWith('meta.') && (t.includes('push') || t.includes('update'))) {
    return { action_class: 'AD_UPDATE', reversibility: 'PARTIALLY_REVERSIBLE', require_verification: true }
  }

  if (t.includes('publish') && (t.startsWith('instagram.') || t.includes('content'))) {
    return { action_class: 'CONTENT_PUBLISH', reversibility: 'NOT_REVERSIBLE', require_verification: true }
  }
  if (t.includes('schedule')) {
    return { action_class: 'CONTENT_SCHEDULE', reversibility: 'REVERSIBLE', require_verification: true }
  }
  if (t.startsWith('instagram.') || t.startsWith('content.') || t.startsWith('creative.')) {
    if (t.includes('draft') || t.includes('generate') || t.includes('idea') || t.includes('plan')) {
      return { action_class: 'GENERATE', reversibility: 'REVERSIBLE', require_verification: false }
    }
    return { action_class: 'CONTENT_WRITE', reversibility: 'REVERSIBLE', require_verification: false }
  }

  if (t.includes('price')) {
    return { action_class: 'SHOPIFY_PRICE_UPDATE', reversibility: 'REVERSIBLE', require_verification: true }
  }
  if (t.includes('status') && t.startsWith('shopify.')) {
    return { action_class: 'SHOPIFY_STATUS_UPDATE', reversibility: 'REVERSIBLE', require_verification: true }
  }
  if (t.includes('image') && t.startsWith('shopify.')) {
    return { action_class: 'SHOPIFY_IMAGE_UPDATE', reversibility: 'REVERSIBLE', require_verification: true }
  }
  if (t.startsWith('shopify.') && (t.includes('update') || t.includes('write'))) {
    return { action_class: 'SHOPIFY_CONTENT_UPDATE', reversibility: 'REVERSIBLE', require_verification: true }
  }

  if (t.includes('render')) {
    return { action_class: 'VIDEO_RENDER', reversibility: 'PARTIALLY_REVERSIBLE', require_verification: true }
  }
  if (t.includes('video') && t.includes('publish')) {
    return { action_class: 'VIDEO_PUBLISH', reversibility: 'NOT_REVERSIBLE', require_verification: true }
  }

  if (t.includes('research') || t.startsWith('research.')) {
    return { action_class: 'RESEARCH', reversibility: 'REVERSIBLE', require_verification: false }
  }
  if (t.includes('analy') || t.includes('diagnos') || t.includes('investigat')) {
    return { action_class: 'ANALYZE', reversibility: 'REVERSIBLE', require_verification: false }
  }
  if (t.includes('generate') || t.includes('draft') || t.includes('idea')) {
    return { action_class: 'GENERATE', reversibility: 'REVERSIBLE', require_verification: false }
  }
  if (t.includes('prepare') || t.includes('preview') || t.includes('plan')) {
    return { action_class: 'PREPARE', reversibility: 'REVERSIBLE', require_verification: false }
  }

  // Default reads
  if (
    t.includes('.get') ||
    t.includes('.list') ||
    t.includes('.status') ||
    t.includes('.sync') ||
    t.includes('overview') ||
    t.includes('snapshot') ||
    t.includes('read')
  ) {
    return { action_class: 'READ', reversibility: 'REVERSIBLE', require_verification: false }
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
