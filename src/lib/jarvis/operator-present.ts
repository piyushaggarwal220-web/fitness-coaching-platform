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
  | 'experiments'
  | 'tasks'
  | 'approvals'
  | 'activity'
  | 'memory'
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
  insight: 'LEARNINGS',
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
  'RESEARCH FINDINGS',
]

export function memoryGroup(category: string): MemoryUiGroup {
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

export function humanToolLabel(toolName: string): string {
  const special: Record<string, string> = {
    'lurvox.revenue': 'Checked LURVOX revenue',
    'analytics.today_overview': 'Checked business overview',
    'shopify.order_stats': 'Checked Shopify orders',
    'shopify.today_commerce': 'Checked Shopify store commerce',
    'meta.today_performance': 'Checked Meta performance',
    'meta.sync': 'Synced Meta campaigns',
  }
  if (special[toolName]) return special[toolName]
  const family = toolFamily(toolName)
  const action = toolName.split('.')[1]?.replace(/_/g, ' ') ?? toolName
  return `${family} · ${action}`
}

export function workingStatusForTool(toolName: string): string {
  const family = toolFamily(toolName)
  switch (family) {
    case 'LURVOX':
      return 'Checking paid sales...'
    case 'Meta Ads':
      return 'Analyzing Meta performance...'
    case 'Shopify':
      return 'Checking Shopify orders...'
    case 'Research':
      return 'Researching competitors...'
    case 'Analytics':
    case 'Funnels':
      return 'Checking business context...'
    case 'Video':
      return 'Checking video jobs...'
    case 'Instagram':
      return 'Generating Instagram ideas...'
    case 'Memory':
      return 'Checking business memory...'
    default:
      return `Working: ${family}`
  }
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
