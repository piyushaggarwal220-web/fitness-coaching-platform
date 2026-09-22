import type { JarvisView } from '@/lib/jarvis/operator-present'
import type { CockpitPresentation } from '@/lib/jarvis/operator-cockpit'

export type ApprovalCard = {
  id: string
  action_label: string
  reason: string
  evidence?: string[]
  current_state?: Record<string, unknown>
  proposed_state?: Record<string, unknown>
  expected_cost_note?: string | null
  risk_level: string
  risk_class: string
  tool_name: string
  status: string
  created_at?: string
}

export type ChatMsg = {
  id: string
  role: string
  content: string
  thinking_summary?: string
  tool_activity?: {
    tool?: string
    family?: string
    label?: string
    status?: string
    summary?: string
  }[]
  approval_ids?: string[]
  cost_usd?: number
  created_at?: string
}

export type Conversation = {
  id: string
  title: string
  updated_at: string
  status?: string
}

export type JarvisTask = {
  id: string
  name: string
  status: string
  status_label: string
  created_at: string
  current_step?: string
  progress?: number | null
  tools?: string[]
  estimated_cost_usd?: number | null
  actual_cost_usd?: number | null
  result?: string | null
  error?: string | null
  cancellable?: boolean
  conversation_id?: string | null
}

export type TimelineStep = {
  id: string
  label: string
  state: 'pending' | 'active' | 'done' | 'error'
  detail?: string
}

export type PulseMetric = number | null

export type PulseMetricCell = {
  value: number | null
  display: string
  status: 'ok' | 'not_connected' | 'no_data' | 'error'
  source: string
  hint: string
  data_status?: string
  period_start?: string | null
  period_end?: string | null
  timezone?: string
  currency?: string | null
  calculation_method?: string
}

export type BusinessPulse = {
  as_of?: string
  today?: {
    revenue: PulseMetricCell
    orders: PulseMetricCell
    ad_spend: PulseMetricCell
    purchases: PulseMetricCell
    cpa: PulseMetricCell
    roas: PulseMetricCell
    conversion_rate: PulseMetricCell
    aov?: PulseMetricCell
  }
  yesterday?: {
    revenue?: PulseMetricCell
    orders?: PulseMetricCell
  }
  series?: {
    revenue_7d?: { date: string; value: number }[]
    sales_7d?: { date: string; value: number }[]
    ads_7d?: { date: string; value: number }[] | null
  }
  by_plan?: { plan_slug: string; gross_inr: number; paid_count: number }[]
  shopify?: {
    connected?: boolean
    source?: string
    as_of?: string
    aov?: number | null
    orders?: number | null
    revenue?: number | null
    refunds_count?: number | null
    refunds_amount?: number | null
    currency?: string
    products?: { title: string; quantity: number }[]
    note?: string
    unavailable_reason?: string
    data_status?: string
  }
  funnel_health?: {
    funnel_id: string | null
    funnel_name: string
    price_inr: number | null
    spend: PulseMetricCell
    purchases: PulseMetricCell
    cpa: PulseMetricCell
    roas: PulseMetricCell
    target_cpa: number | null
    target_roas: number | null
    max_acceptable_cpa?: number | null
    available: boolean
  }[]
  attention?: string[]
  opportunities?: string[]
  wins?: string[]
  research?: { id: string; title: string; finding: string; created_at: string }[]
  research_unavailable?: string | null
  note?: string
}

export type IntegrationStatus = 'connected' | 'not_connected' | 'error' | 'disabled' | 'partial'

export type IntegrationCard = {
  id: string
  name: string
  status: IntegrationStatus
  summary: string
  can_do: string[]
  cannot_do: string[]
  configure_hint: string | null
  testable: boolean
  missing: string[]
}

export type CapabilityGroup = 'WORKING' | 'WAITING FOR INTEGRATION' | 'REQUIRES APPROVAL' | 'BLOCKED'

export type CapabilityItem = {
  title: string
  detail: string
  group: CapabilityGroup
  tool?: string
}

export type SystemHealth = {
  level: 'operational' | 'partial' | 'action_required'
  label: string
  explanation: string
  connected_count?: number
  total_count?: number
  attention_count?: number
}

export type ActivityItem = {
  id: string
  at: string
  kind: string
  title: string
  detail?: string
}

export type MemoryRow = {
  id: string
  category: string
  group?: string
  title: string
  summary: string
  confidence?: string
  created_at?: string
  updated_at?: string
  tags?: string[]
}

export type NotificationRow = {
  id: string
  kind: string
  category?: string
  title: string
  body: string
  created_at: string
  read_at?: string | null
  link?: string | null
}

export type JarvisDashboard = {
  pulse?: BusinessPulse | null
  cockpit?: CockpitPresentation | null
  open_incidents?: number
  today?: {
    byFunnel?: Record<string, unknown>[]
    unclassified?: Record<string, unknown>
    pendingApprovals?: number
  }
  funnels?: Record<string, unknown>[]
  cost?: Record<string, unknown>
  budgets?: Record<string, unknown>
  approvals?: ApprovalCard[]
  notifications?: NotificationRow[]
  unread_notifications?: number
  jobs?: Record<string, unknown>[]
  tasks?: { id: string; objective: string; status: string; status_label?: string; created_at: string; spent_usd?: number }[]
  memory?: MemoryRow[]
  activity?: ActivityItem[]
  activity_digest?: {
    observed?: string[]
    actions?: string[]
    learned?: string[]
    waiting?: string[]
    recommends?: string[]
    spent_usd?: number
    summary?: string
    digest_date?: string
  } | null
  conversations?: Conversation[]
  autonomy_level?: number
  live_meta_execution?: boolean
  execution?: {
    kill_switch?: boolean
    mode?: string
    dry_run?: boolean
    shadow_mode?: boolean
    canary?: boolean
    note?: string
    live_meta_execution?: boolean
    live_instagram_publishing?: boolean
    limits?: Record<string, number>
  }
  events?: {
    note?: string
    health?: Record<string, unknown> | null
    summary_lines?: string[]
    recent?: {
      id: string
      event_type: string
      system: string | null
      priority: string | null
      significance: string | null
      status: string
      funnel_id: string | null
      created_at: string
    }[]
  }
  strategic_memory?: {
    note?: string
    health?: Record<string, unknown> | null
    patterns?: string[]
    open_questions?: string[]
    stale_assumptions?: string[]
    conflicts?: { id?: string; reason: string; funnel_id: string | null }[]
    limitations?: string[]
  }
  opportunities?: {
    note?: string
    health?: Record<string, unknown> | null
    critical?: { id?: string; title?: string; priority?: string }[]
    high?: { id?: string; title?: string; priority?: string }[]
    watch?: { id?: string; title?: string }[]
  }
  strategy?: {
    note?: string
    goals?: unknown[]
    plans?: unknown[]
    at_risk?: unknown[]
    health?: Record<string, unknown>
  }
  finance?: Record<string, unknown>
  experiments?: {
    note?: string
    health?: Record<string, unknown>
    recent?: { id?: string; name?: string; status?: string; lifecycle?: string }[]
  }
  realtime?: {
    enabled?: boolean
    provider?: string
    model?: string | null
    status?: string
    note?: string
    modalities?: {
      text?: string
      voice_input?: string
      voice_output?: string
      realtime?: string
    }
    missing?: string[]
  }
  meta?: Record<string, unknown>
  health?: SystemHealth | null
  integrations?: IntegrationCard[]
  capabilities?: Record<CapabilityGroup, CapabilityItem[]> | null
  instagram_intelligence?: {
    configured?: boolean
    connected?: boolean
    live_publishing_enabled?: boolean
    followers?: number | null
    posts_synced?: number | null
    latest_sync_at?: string | null
    latest_sync_status?: string | null
    reach_median?: number | null
    interactions_median?: number | null
    data_coverage_note?: string
  }
  video_workspace?: {
    provider_configured?: boolean
    provider?: string
    provider_kind?: 'REAL' | 'TEST' | 'STUB'
    note?: string
    missing?: string[]
    stage?: string
    callback_configured?: boolean
    intelligence?: {
      configured?: boolean
      provider?: string
      kind?: 'REAL' | 'TEST' | 'STUB'
      note?: string
      missing?: string[]
      capabilities?: Record<string, string>
    }
    sessions?: {
      id: string
      title: string
      status?: string
      source_count?: number
      total_duration_sec?: number
      opportunity_count?: number
      created_at?: string
      updated_at?: string
    }[]
    recent_jobs?: {
      id: string
      status: string
      provider?: string
      provider_job_id?: string | null
      has_output?: boolean
      approval_status?: string | null
      error?: string | null
      created_at?: string
      preset?: string | null
      aspect_ratio?: string | null
      estimated_cost_usd?: number | null
      actual_cost_usd?: number | null
    }[]
  }
  creative_director?: {
    note?: string
    plan_count?: number
    plans?: {
      id: string
      title: string
      hook?: string | null
      status: string
      version: number
      objective?: string | null
      estimated_duration_sec?: number | null
      confidence?: string | null
      video_session_id?: string | null
      updated_at?: string
    }[]
  }
  autonomous_operator?: {
    note?: string
    attention?: {
      fingerprint?: string
      severity: string
      system: string
      title: string
      observation?: string
      next_action: string
      requires_approval?: boolean
      occurrence_count?: number
    }[]
    morning_brief?: { date?: string; text?: string } | null
  }
}

export type CommandView = JarvisView
