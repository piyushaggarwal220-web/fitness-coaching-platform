/** Shared presentation helpers for Jarvis Command Center (safe for client + server). */

export const JARVIS_ACCENT = '#FF6200'

export const QUICK_COMMANDS = [
  { id: 'today', label: "Today's brief", prompt: 'What happened today?' },
  { id: 'problems', label: 'Find problems', prompt: 'Find problems in my business.' },
  { id: 'revenue', label: 'Analyze revenue', prompt: 'How much money did we make today?' },
  { id: 'ads', label: 'Check ads', prompt: 'How much did I spend on Meta ads today?' },
  { id: 'focus', label: 'What should I do?', prompt: 'What should I focus on today?' },
] as const

export const DOMAIN_COMMANDS = [
  { id: 'funnel99', label: 'Analyze ₹99 Funnel', prompt: 'Analyze my ₹99 funnel.' },
  { id: 'funnel1699', label: 'Analyze ₹1,699 Funnel', prompt: 'Analyze my ₹1,699 funnel.' },
  { id: 'research', label: 'Research', prompt: 'Research competitors.' },
  { id: 'approvals', label: 'Pending Approvals', prompt: 'Show me pending approvals.' },
] as const

export type JarvisView =
  | 'command'
  | 'chat'
  | 'revenue'
  | 'funnels'
  | 'customers'
  | 'growth'
  | 'marketing'
  | 'creatives'
  | 'instagram'
  | 'instagram_intel'
  | 'content_ops'
  | 'video'
  | 'experiments'
  | 'tasks'
  | 'approvals'
  | 'activity'
  | 'memory'
  | 'learning'
  | 'taste'
  | 'integrations'
  | 'diagnostics'
  | 'settings'
  | 'notifications'

export type MemoryUiGroup =
  | 'BUSINESS FACTS'
  | 'DECISIONS'
  | 'PREFERENCES'
  | 'RULES'
  | 'LEARNINGS'
  | 'HYPOTHESES'
  | 'RESEARCH FINDINGS'

export const MEMORY_CATEGORIES = [
  'business_rule',
  'funnel_economics',
  'experiment',
  'creative',
  'audience',
  'research',
  'decision',
  'outcome',
  'preference',
  'insight',
] as const

export type MemoryCategory = (typeof MEMORY_CATEGORIES)[number]

const MEMORY_GROUP_MAP: Record<string, MemoryUiGroup> = {
  funnel_economics: 'BUSINESS FACTS',
  audience: 'BUSINESS FACTS',
  creative: 'BUSINESS FACTS',
  decision: 'DECISIONS',
  preference: 'PREFERENCES',
  business_rule: 'RULES',
  insight: 'HYPOTHESES',
  outcome: 'LEARNINGS',
  experiment: 'LEARNINGS',
  research: 'RESEARCH FINDINGS',
}

export const MEMORY_GROUP_ORDER: MemoryUiGroup[] = [
  'BUSINESS FACTS',
  'DECISIONS',
  'PREFERENCES',
  'RULES',
  'LEARNINGS',
  'HYPOTHESES',
  'RESEARCH FINDINGS',
]

export function memoryGroup(category: string, tags?: string[] | null): MemoryUiGroup {
  if (tags?.includes('hypothesis') || category === 'insight') return 'HYPOTHESES'
  return MEMORY_GROUP_MAP[category] ?? 'LEARNINGS'
}

export type TaskStatusUi =
  | 'QUEUED'
  | 'RUNNING'
  | 'WAITING_FOR_APPROVAL'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED'
  | 'PAUSED_BUDGET'
  | 'PAUSED'

const TASK_STATUS_MAP: Record<string, TaskStatusUi> = {
  queued: 'QUEUED',
  running: 'RUNNING',
  awaiting_approval: 'WAITING_FOR_APPROVAL',
  completed: 'COMPLETED',
  failed: 'FAILED',
  cancelled: 'CANCELLED',
  budget_exhausted: 'PAUSED_BUDGET',
  paused_budget: 'PAUSED_BUDGET',
  paused: 'PAUSED',
}

export function taskStatusLabel(status: string): TaskStatusUi {
  return TASK_STATUS_MAP[status] ?? (status.toUpperCase() as TaskStatusUi)
}

export function canCancelTask(status: string): boolean {
  return ['queued', 'running', 'paused', 'awaiting_approval'].includes(status)
}

export type ToolFamily = 'LURVOX' | 'Meta Ads' | 'Shopify' | 'Research' | 'Analytics' | 'Video' | 'Instagram' | 'Memory' | 'System' | 'Funnels'

export function toolFamily(toolName: string): ToolFamily {
  if (toolName.startsWith('lurvox.')) return 'LURVOX'
  if (toolName.startsWith('meta.')) return 'Meta Ads'
  if (toolName.startsWith('shopify.')) return 'Shopify'
  if (toolName.startsWith('research.')) return 'Research'
  if (toolName.startsWith('analytics.') || toolName.startsWith('funnels.') || toolName.startsWith('creatives.')) {
    if (toolName.startsWith('funnels.')) return 'Funnels'
    return 'Analytics'
  }
  if (toolName.startsWith('video.')) return 'Video'
  if (toolName.startsWith('instagram.')) return 'Instagram'
  if (toolName.startsWith('memory.')) return 'Memory'
  return 'System'
}

/** Operator-facing activity language — never expose raw tool ids by default. */
export function humanToolLabel(toolName: string): string {
  const special: Record<string, string> = {
    'lurvox.revenue': 'Checking LURVOX revenue',
    'analytics.today_overview': 'Analyzing performance',
    'analytics.performance_analysis': 'Analyzing performance',
    'shopify.order_stats': 'Checking Shopify orders',
    'shopify.today_commerce': 'Checking Shopify commerce',
    'meta.today_performance': 'Checking Meta performance',
    'meta.sync': 'Syncing Meta campaigns',
    'memory.search': "Checking what we've learned before",
    'execution.policy_status': 'Checking execution permissions',
    'video.create_edl': 'Creating video edit',
    'video.render': 'Rendering video',
    'video.analyze': 'Analyzing footage',
    'instagram.plan_content': 'Planning Instagram content',
    'instagram.publish': 'Preparing Instagram publish package',
    'creatives.generate': 'Creating ad creatives',
    'research.web': 'Researching the web',
    'research.brave': "Researching what's trending",
  }
  if (special[toolName]) return special[toolName]
  const family = toolFamily(toolName)
  const action = toolName.split('.')[1]?.replace(/_/g, ' ') ?? toolName
  const familyVerb: Partial<Record<ToolFamily, string>> = {
    LURVOX: 'Checking',
    'Meta Ads': 'Checking',
    Shopify: 'Checking',
    Research: 'Researching',
    Analytics: 'Analyzing',
    Funnels: 'Analyzing',
    Video: 'Working on',
    Instagram: 'Working on',
    Memory: 'Checking',
    System: 'Running',
  }
  return `${familyVerb[family] ?? 'Working on'} ${action}`
}

export function workingStatusForTool(toolName: string): string {
  const family = toolFamily(toolName)
  switch (family) {
    case 'LURVOX':
      return 'Checking paid sales…'
    case 'Meta Ads':
      return 'Analyzing Meta performance…'
    case 'Shopify':
      return 'Checking Shopify orders…'
    case 'Research':
      return 'Researching…'
    case 'Analytics':
    case 'Funnels':
      return 'Checking business context…'
    case 'Video':
      return 'Working on video…'
    case 'Instagram':
      return 'Planning Instagram content…'
    case 'Memory':
      return "Checking what we've learned before…"
    default:
      return `Working · ${family}`
  }
}

/** ⌘K / Ctrl+K command palette entries — route through existing orchestrator prompts. */
export const PALETTE_COMMANDS = [
  { id: 'reel', label: 'Create Reel', prompt: 'Make a Reel from today’s footage.', group: 'Create' },
  { id: 'ad', label: 'Create Ad', prompt: 'Create five ads for the ₹99 funnel.', group: 'Create' },
  { id: 'content', label: 'Prepare Content', prompt: "Prepare tomorrow's Instagram content.", group: 'Create' },
  { id: 'today', label: "Show Today's Business", prompt: 'What happened today?', group: 'Analyze' },
  { id: 'perf', label: 'Analyze Performance', prompt: 'Analyze performance and explain any CPA changes.', group: 'Analyze' },
  { id: 'opps', label: 'Show Opportunities', prompt: 'Show me what needs my attention and top opportunities.', group: 'Analyze' },
  { id: 'approvals', label: 'Show Approvals', prompt: 'Show me pending approvals.', group: 'Operate' },
  { id: 'research', label: 'Research Topic', prompt: "Research what's trending in fitness content.", group: 'Operate' },
  { id: 'finance', label: 'Check Finances', prompt: 'Summarize financial status using available verified sources.', group: 'Analyze' },
  { id: 'experiments', label: 'Review Experiments', prompt: 'Review active and recent experiments.', group: 'Analyze' },
  { id: 'plans', label: 'Show Active Plans', prompt: 'Show active strategic plans and any at-risk goals.', group: 'Analyze' },
  { id: 'health', label: 'System Health', prompt: 'Report system health and integration status.', group: 'System' },
] as const

export const OPERATOR_QUICK_ACTIONS = [
  { id: 'reel', label: 'Create Reel', prompt: 'Make a Reel from today’s footage.' },
  { id: 'ad', label: 'Create Ad', prompt: 'Create five ads for the ₹99 funnel.' },
  { id: 'content', label: 'Prepare Content', prompt: "Prepare tomorrow's Instagram content." },
  { id: 'analyze', label: 'Analyze Business', prompt: 'What happened today? What needs my attention?' },
  { id: 'research', label: 'Research', prompt: "Research what's trending." },
  { id: 'opps', label: 'Show Opportunities', prompt: 'Show me top opportunities and critical alerts.' },
] as const

export type JarvisCoreState =
  | 'IDLE'
  | 'LISTENING'
  | 'THINKING'
  | 'OBSERVING'
  | 'RESEARCHING'
  | 'PLANNING'
  | 'CREATING'
  | 'RENDERING'
  | 'WAITING_FOR_APPROVAL'
  | 'EXECUTING'
  | 'VERIFYING'
  | 'LEARNING'
  | 'COMPLETED'
  | 'ERROR'
  | 'PAUSED'

export function coreStateFromContext(input: {
  busy?: boolean
  listening?: boolean
  speaking?: boolean
  error?: string | null
  pendingApprovals?: number
  budgetExhausted?: boolean
  killSwitch?: boolean
  activeTool?: string | null
  timelineActiveLabel?: string | null
}): { state: JarvisCoreState; detail: string } {
  if (input.killSwitch) return { state: 'PAUSED', detail: 'Kill switch active' }
  if (input.budgetExhausted) return { state: 'PAUSED', detail: 'Daily AI budget reached' }
  if (input.error) return { state: 'ERROR', detail: input.error }
  if (input.listening) return { state: 'LISTENING', detail: 'Listening' }
  if (input.speaking) return { state: 'COMPLETED', detail: 'Responding' }
  if ((input.pendingApprovals ?? 0) > 0 && !input.busy) {
    return { state: 'WAITING_FOR_APPROVAL', detail: 'Waiting for your approval' }
  }
  if (!input.busy) return { state: 'IDLE', detail: 'Ready' }

  const tool = (input.activeTool || '').toLowerCase()
  const label = (input.timelineActiveLabel || '').toLowerCase()
  if (tool.includes('render') || label.includes('render') || label.includes('shotstack')) {
    return { state: 'RENDERING', detail: 'Waiting for render provider' }
  }
  if (tool.startsWith('research.') || label.includes('research')) {
    return { state: 'RESEARCHING', detail: workingStatusForTool(input.activeTool || 'research.web') }
  }
  if (tool.startsWith('memory.') || label.includes('learn')) {
    return { state: 'LEARNING', detail: workingStatusForTool(input.activeTool || 'memory.search') }
  }
  if (
    tool.startsWith('video.') ||
    tool.startsWith('instagram.') ||
    tool.startsWith('creatives.') ||
    label.includes('creating') ||
    label.includes('creative')
  ) {
    return { state: 'CREATING', detail: workingStatusForTool(input.activeTool || 'video.create_edl') }
  }
  if (tool.startsWith('execution.') || label.includes('execut')) {
    return { state: 'EXECUTING', detail: 'Executing approved action' }
  }
  if (label.includes('verif')) return { state: 'VERIFYING', detail: 'Verifying result' }
  if (label.includes('plan') || label.includes('prepar')) {
    return { state: 'PLANNING', detail: 'Planning next steps' }
  }
  if (
    tool.startsWith('analytics.') ||
    tool.startsWith('lurvox.') ||
    tool.startsWith('meta.') ||
    tool.startsWith('shopify.') ||
    label.includes('observ') ||
    label.includes('check')
  ) {
    return { state: 'OBSERVING', detail: workingStatusForTool(input.activeTool || 'analytics.today_overview') }
  }
  return { state: 'THINKING', detail: 'Understanding request' }
}

export type ActivityKindUi =
  | 'OBSERVATION'
  | 'ANALYSIS'
  | 'RESEARCH'
  | 'ACTION'
  | 'APPROVAL'
  | 'ERROR'

export function activityKindFromSource(input: {
  eventType?: string
  toolName?: string
  notificationKind?: string
  status?: string
}): ActivityKindUi {
  if (input.status === 'failed' || input.notificationKind === 'alert') return 'ERROR'
  if (input.notificationKind === 'approval' || input.eventType?.includes('approval')) return 'APPROVAL'
  if (input.notificationKind === 'cost') return 'ERROR'
  const tool = input.toolName || input.eventType || ''
  if (tool.startsWith('research.') || input.notificationKind === 'learning') return 'RESEARCH'
  if (
    tool.startsWith('analytics.') ||
    tool.startsWith('funnels.') ||
    tool.startsWith('lurvox.') ||
    tool.includes('observe')
  ) {
    return tool.includes('investigate') || tool.includes('analyze') ? 'ANALYSIS' : 'OBSERVATION'
  }
  if (tool.startsWith('meta.') || tool.startsWith('shopify.') || tool.startsWith('video.') || tool.startsWith('instagram.')) {
    return 'ACTION'
  }
  if (input.notificationKind === 'activity') return 'ACTION'
  return 'OBSERVATION'
}

export type NotificationCategoryUi =
  | 'APPROVAL NEEDED'
  | 'TASK COMPLETE'
  | 'IMPORTANT CHANGE'
  | 'ERROR'
  | 'RESEARCH FINDING'
  | 'BUDGET WARNING'
  | 'INFO'

export function notificationCategory(kind: string, title = ''): NotificationCategoryUi {
  const k = kind.toLowerCase()
  const t = title.toLowerCase()
  if (k === 'approval') return 'APPROVAL NEEDED'
  if (k === 'cost' || t.includes('budget')) return 'BUDGET WARNING'
  if (k === 'learning' || t.includes('research')) return 'RESEARCH FINDING'
  if (k === 'alert' || t.includes('error') || t.includes('fail')) return 'ERROR'
  if (t.includes('complete') || t.includes('acted')) return 'TASK COMPLETE'
  if (k === 'activity') return 'IMPORTANT CHANGE'
  return 'INFO'
}

export const AUTONOMY_LEVELS: {
  level: 0 | 1 | 2 | 3 | 4
  title: string
  description: string
}[] = [
  { level: 0, title: 'Disabled', description: 'Jarvis observes only. No recommendations or actions.' },
  { level: 1, title: 'Recommendations', description: 'Jarvis can advise. It cannot queue write actions.' },
  { level: 2, title: 'Approval required', description: 'Default. Significant actions wait for you.' },
  { level: 3, title: 'Guarded autonomy', description: 'Low-risk work may proceed. Spend still needs approval.' },
  { level: 4, title: 'Full autonomy within caps', description: 'Within budget and guardrails. Live Meta execution stays off unless separately enabled.' },
]

export function formatInr(value: number | null | undefined): string {
  if (value == null || Number.isNaN(Number(value))) return 'No data available'
  return `₹${Math.round(Number(value)).toLocaleString('en-IN')}`
}

export function formatUsd(value: number | null | undefined, digits = 2): string {
  if (value == null || Number.isNaN(Number(value))) return 'No data available'
  return `$${Number(value).toFixed(digits)}`
}

export function formatRatio(value: number | null | undefined, digits = 2): string {
  if (value == null || Number.isNaN(Number(value))) return 'No data available'
  return Number(value).toFixed(digits)
}

export function formatPercent(value: number | null | undefined): string {
  if (value == null || Number.isNaN(Number(value))) return 'No data available'
  return `${(Number(value) * 100).toFixed(1)}%`
}

export function formatTime(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function relativeTime(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  const diff = Date.now() - d.getTime()
  if (Number.isNaN(diff)) return ''
  const mins = Math.round(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.round(hours / 24)
  return `${days}d ago`
}

export function describeStateValue(value: unknown): string {
  if (value == null || value === '') return '—'
  if (typeof value === 'number') return Number.isInteger(value) ? String(value) : value.toFixed(2)
  if (typeof value === 'boolean') return value ? 'yes' : 'no'
  if (typeof value === 'string') return value.slice(0, 160)
  if (Array.isArray(value)) return value.map(describeStateValue).join(', ').slice(0, 160)
  try {
    return JSON.stringify(value).slice(0, 160)
  } catch {
    return '—'
  }
}

const HIDDEN_STATE_KEYS = new Set([
  'token',
  'access_token',
  'api_key',
  'secret',
  'password',
  'input',
  'raw',
  'headers',
])

export function publicStateEntries(state: Record<string, unknown> | null | undefined): { label: string; value: string }[] {
  if (!state) return []
  return Object.entries(state)
    .filter(([k]) => !HIDDEN_STATE_KEYS.has(k.toLowerCase()) && !k.toLowerCase().includes('token'))
    .slice(0, 8)
    .map(([k, v]) => ({
      label: k.replace(/_/g, ' '),
      value: describeStateValue(v),
    }))
}
