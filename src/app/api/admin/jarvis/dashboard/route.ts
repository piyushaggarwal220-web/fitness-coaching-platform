import { NextResponse } from 'next/server'
import { requireMarketingAdmin } from '@/lib/ai-marketing/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { buildJarvisContext } from '@/lib/jarvis/core/context'
import { getCostDashboard } from '@/lib/jarvis/cost/usage'
import { getJarvisBudgets } from '@/lib/jarvis/cost/governor'
import { listPendingApprovals } from '@/lib/jarvis/permissions/approval-engine'
import { listTools } from '@/lib/jarvis/tools/registry'
import { ensureJarvisToolsRegistered } from '@/lib/jarvis/tools/builtins'
import { getAutonomyLevel } from '@/lib/ai-marketing/settings'
import { liveMetaExecutionEnabled } from '@/lib/ai-marketing/autonomy'
import { buildBusinessPulse } from '@/lib/jarvis/operator-pulse'
import { presentCockpit } from '@/lib/jarvis/operator-cockpit'
import { buildActivityFeed } from '@/lib/jarvis/operator-activity'
import { buildOperatorSystem } from '@/lib/jarvis/operator-integrations'
import { notificationCategory, taskStatusLabel } from '@/lib/jarvis/operator-present'
import { sanitizePublicJson } from '@/lib/jarvis/operator-errors'
import { listIncidents } from '@/lib/jarvis/diagnostics'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const auth = await requireMarketingAdmin()
  if (!auth.ok) return auth.response

  ensureJarvisToolsRegistered()
  const admin = createAdminClient()

  const [
    context,
    cost,
    budgets,
    approvals,
    autonomy,
    pulse,
    activity,
    system,
    { data: conversations },
    { data: notifications },
    { data: jobs },
    { data: memory },
    { data: digests },
    { data: tasks },
    incidents,
  ] = await Promise.all([
    buildJarvisContext(null),
    getCostDashboard(),
    getJarvisBudgets(),
    listPendingApprovals(20),
    getAutonomyLevel(),
    buildBusinessPulse().catch(() => null),
    buildActivityFeed(20).catch(() => []),
    buildOperatorSystem().catch(() => null),
    admin
      .from('jarvis_conversations')
      .select('id, title, updated_at, status')
      .eq('status', 'active')
      .order('updated_at', { ascending: false })
      .limit(30),
    admin
      .from('jarvis_notifications')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(30),
    admin
      .from('jarvis_background_jobs')
      .select('id, job_type, status, spent_usd, error, created_at, completed_at')
      .order('created_at', { ascending: false })
      .limit(15),
    admin
      .from('jarvis_memory')
      .select('id, category, title, summary, confidence, created_at')
      .order('created_at', { ascending: false })
      .limit(15),
    admin
      .from('jarvis_activity_digests')
      .select('*')
      .order('digest_date', { ascending: false })
      .limit(3),
    admin
      .from('jarvis_tasks')
      .select('id, objective, status, spent_usd, created_at, completed_at, conversation_id, error')
      .order('created_at', { ascending: false })
      .limit(20),
    listIncidents().catch(() => []),
  ])

  const { listRecentLearnings } = await import('@/lib/jarvis/memory/learning-loop')
  const recentLearning = await listRecentLearnings(8).catch(() => [])

  const { buildBusinessSystemRegistry } = await import('@/lib/jarvis/operator/systems/registry')
  const systemRegistry = await buildBusinessSystemRegistry().catch(() => ({
    systems: [],
    retrieved_at: new Date().toISOString(),
  }))

  const publicApprovals = approvals.map((a) => ({
    ...a,
    current_state: sanitizePublicJson(a.current_state) ?? {},
    proposed_state: sanitizePublicJson(a.proposed_state) ?? {},
    evidence: Array.isArray(a.evidence) ? a.evidence.slice(0, 8) : [],
  }))

  const publicNotifications = (notifications ?? []).map((n) => ({
    ...n,
    category: notificationCategory(String(n.kind), String(n.title)),
  }))

  const mappedTasks = (tasks ?? []).map((t) => ({
    ...t,
    status_label: taskStatusLabel(String(t.status)),
  }))

  const incidentRows = (incidents ?? []).map((row) => ({
    id: String((row as { id?: string }).id ?? ''),
    title: (row as { title?: string | null }).title ?? null,
    symptom: (row as { symptom?: string | null }).symptom ?? null,
    status: (row as { status?: string | null }).status ?? null,
  }))

  const cockpit = presentCockpit({
    pulse,
    health: system?.health ?? null,
    approvals: publicApprovals.map((a) => ({
      id: a.id,
      action_label: a.action_label,
      reason: a.reason,
      risk_level: a.risk_level,
    })),
    incidents: incidentRows,
    tasks: mappedTasks.map((t) => ({
      id: t.id,
      objective: t.objective,
      status: t.status,
      created_at: t.created_at,
      completed_at: (t as { completed_at?: string }).completed_at,
    })),
    activity: (activity ?? []).map((item) => ({
      id: item.id,
      at: item.at,
      kind: item.kind,
      title: item.title,
      detail: item.detail,
    })),
    refreshed_at: new Date().toISOString(),
  })

  return NextResponse.json({
    success: true,
    dashboard: {
      today: context.overview_summary,
      pulse,
      cockpit,
      open_incidents: incidentRows.filter(
        (i) => i.status && !['resolved', 'wont_fix'].includes(i.status)
      ).length,
      funnels: context.funnels,
      cost,
      budgets,
      approvals: publicApprovals,
      notifications: publicNotifications,
      unread_notifications: publicNotifications.filter((n) => !n.read_at).length,
      jobs: jobs ?? [],
      tasks: mappedTasks,
      memory: memory ?? [],
      recent_learning: recentLearning,
      business_systems: systemRegistry.systems,
      activity,
      activity_digest: digests?.[0] ?? null,
      recent_digests: digests ?? [],
      conversations: conversations ?? [],
      tools: listTools().map((t) => ({
        name: t.name,
        description: t.description,
        riskClass: t.riskClass,
        estimatedCostUsd: t.estimatedCostUsd,
        canRunAutonomously: t.canRunAutonomously,
      })),
      autonomy_level: autonomy,
      live_meta_execution: liveMetaExecutionEnabled(),
      execution: await (async () => {
        try {
          const { getExecutionConfig } = await import('@/lib/jarvis/execution/policy/config')
          const { liveInstagramPublishingEnabled } = await import('@/lib/jarvis/instagram')
          const cfg = await getExecutionConfig()
          return sanitizePublicJson({
            kill_switch: cfg.kill_switch,
            mode: cfg.mode,
            dry_run: cfg.dry_run,
            shadow_mode: cfg.shadow_mode,
            canary: cfg.canary,
            note: cfg.note,
            live_meta_execution: liveMetaExecutionEnabled(),
            live_instagram_publishing: liveInstagramPublishingEnabled(),
            limits: {
              max_auto_action_cost_usd: cfg.limits.max_auto_action_cost_usd,
              max_auto_daily_action_cost_usd: cfg.limits.max_auto_daily_action_cost_usd,
              max_auto_actions_per_day: cfg.limits.max_auto_actions_per_day,
            },
          })
        } catch {
          return {
            kill_switch: false,
            mode: 'approval',
            dry_run: false,
            shadow_mode: false,
            canary: false,
            note: 'Execution status unavailable.',
            live_meta_execution: liveMetaExecutionEnabled(),
            live_instagram_publishing: false,
          }
        }
      })(),
      meta: context.meta_status,
      health: system?.health ?? null,
      integrations: system?.integrations ?? [],
      capabilities: system?.capabilities ?? null,
      instagram_intelligence: await (async () => {
        try {
          const { getInstagramIntelligenceSummary, liveInstagramPublishingEnabled } = await import(
            '@/lib/jarvis/instagram'
          )
          const summary = await getInstagramIntelligenceSummary()
          return sanitizePublicJson({
            ...summary,
            live_publishing_enabled: liveInstagramPublishingEnabled(),
            connected: summary.configured,
          })
        } catch {
          return {
            configured: false,
            connected: false,
            live_publishing_enabled: false,
            followers: null,
            posts_synced: null,
            latest_sync_at: null,
            latest_sync_status: null,
            reach_median: null,
            interactions_median: null,
            data_coverage_note: 'Instagram intelligence unavailable.',
          }
        }
      })(),
      video_workspace: await (async () => {
        try {
          const { describeVideoProviderConfig, listRecentVideoJobs } = await import(
            '@/lib/ai-marketing/workflows/video-jobs'
          )
          const { describeVideoIntelligenceConfig, listVideoSessions } = await import(
            '@/lib/jarvis/video/intelligence'
          )
          const cfg = describeVideoProviderConfig()
          const intel = describeVideoIntelligenceConfig()
          const jobs = await listRecentVideoJobs(12)
          const sessions = await listVideoSessions(12).catch(() => [])
          return sanitizePublicJson({
            provider_configured: cfg.configured,
            provider: cfg.provider,
            provider_kind: cfg.kind,
            note: cfg.note,
            missing: cfg.missing,
            stage: cfg.stage ?? null,
            callback_configured: cfg.callback_configured ?? false,
            intelligence: {
              configured: intel.configured,
              provider: intel.provider,
              kind: intel.kind,
              note: intel.note,
              missing: intel.missing,
              capabilities: intel.capabilities,
            },
            sessions: sessions.map((s) => ({
              id: s.id,
              title: s.title,
              status: s.status,
              source_count: s.source_count,
              total_duration_sec: s.total_duration_sec,
              opportunity_count: s.opportunity_count,
              created_at: s.created_at,
              updated_at: s.updated_at,
            })),
            recent_jobs: jobs.map((j) => ({
              id: j.id,
              status: j.status,
              provider: j.provider,
              provider_job_id: j.provider_job_id,
              has_output: j.has_output,
              approval_status: j.approval_status,
              error: j.error,
              created_at: j.created_at,
              preset: j.preset,
              aspect_ratio: j.aspect_ratio,
              estimated_cost_usd: j.estimated_cost_usd,
              actual_cost_usd: j.actual_cost_usd,
            })),
          })
        } catch {
          return {
            provider_configured: false,
            provider: 'stub',
            provider_kind: 'STUB',
            note: 'VIDEO PROVIDER: NOT CONNECTED',
            missing: ['VIDEO_EDIT_PROVIDER', 'VIDEO_EDIT_API_KEY'],
            intelligence: {
              configured: false,
              provider: 'stub',
              kind: 'STUB',
              note: 'VIDEO INTELLIGENCE: NOT CONFIGURED',
              missing: [],
              capabilities: {},
            },
            sessions: [],
            recent_jobs: [],
          }
        }
      })(),
      creative_director: await (async () => {
        try {
          const { listCreativePlans } = await import('@/lib/jarvis/creative')
          const plans = await listCreativePlans({ limit: 12 })
          return sanitizePublicJson({
            note: 'Phase 5 Creative Director — plans only. No auto-publish. No auto-render.',
            plan_count: plans.length,
            plans: plans.map((p) => ({
              id: p.id,
              title: p.title,
              hook: p.hook,
              status: p.status,
              version: p.version,
              objective: p.objective,
              estimated_duration_sec: p.estimated_duration_sec,
              confidence: p.confidence,
              video_session_id: p.video_session_id,
              updated_at: p.updated_at,
            })),
          })
        } catch {
          return {
            note: 'Creative Director unavailable (migration may be pending).',
            plan_count: 0,
            plans: [],
          }
        }
      })(),
      autonomous_operator: await (async () => {
        try {
          const { listOpenAttention, getLatestMorningBrief } = await import(
            '@/lib/jarvis/autonomous'
          )
          const [attention, brief] = await Promise.all([
            listOpenAttention(12),
            getLatestMorningBrief(),
          ])
          return sanitizePublicJson({
            note: 'Phase 10 attention queue — significant writes remain approval-gated.',
            attention: attention.map((a) => ({
              fingerprint: a.fingerprint,
              severity: a.severity,
              system: a.system,
              title: a.title,
              observation: a.observation,
              next_action: a.next_action,
              requires_approval: a.requires_approval,
              occurrence_count: a.occurrence_count ?? 1,
            })),
            morning_brief: brief
              ? { date: brief.brief_date, text: brief.text.slice(0, 800) }
              : null,
          })
        } catch {
          return {
            note: 'Autonomous operator unavailable (migration may be pending).',
            attention: [],
            morning_brief: null,
          }
        }
      })(),
      realtime: await (async () => {
        try {
          const { describeRealtimeCapability } = await import('@/lib/jarvis/realtime/config')
          return sanitizePublicJson(describeRealtimeCapability())
        } catch {
          return {
            enabled: false,
            provider: 'unknown',
            status: 'UNKNOWN',
            note: 'Realtime capability unavailable.',
            modalities: {
              text: 'AVAILABLE',
              voice_input: 'UNKNOWN',
              voice_output: 'UNKNOWN',
              realtime: 'UNKNOWN',
            },
            missing: [],
          }
        }
      })(),
      events: await (async () => {
        try {
          const { listRecentEvents, getEventHealth, summarizeEventsForBrief } = await import(
            '@/lib/jarvis/events'
          )
          const [recent, health] = await Promise.all([listRecentEvents(20), getEventHealth()])
          return sanitizePublicJson({
            note: 'Phase 13 event signals — triggers only; writes still Phase 12 gated.',
            health,
            summary_lines: summarizeEventsForBrief(recent),
            recent: recent.slice(0, 12).map((e) => ({
              id: e.id,
              event_type: e.event_type,
              system: e.system,
              priority: e.priority,
              significance: e.significance,
              status: e.status,
              funnel_id: e.funnel_id,
              created_at: e.created_at,
            })),
          })
        } catch {
          return {
            note: 'Events unavailable (migration may be pending).',
            health: null,
            summary_lines: [],
            recent: [],
          }
        }
      })(),
      strategic_memory: await (async () => {
        try {
          const { buildBusinessKnowledgeSnapshot, getStrategicMemoryHealth, listOpenConflicts } =
            await import('@/lib/jarvis/memory/strategic')
          const [snapshot, health, conflicts] = await Promise.all([
            buildBusinessKnowledgeSnapshot(),
            getStrategicMemoryHealth(),
            listOpenConflicts(8),
          ])
          return sanitizePublicJson({
            note: 'Phase 14 strategic intelligence — evidence-backed; Taste ≠ strategy; Phase 12 authoritative.',
            health,
            patterns: snapshot.strategic_patterns.slice(0, 5),
            open_questions: snapshot.open_questions.slice(0, 4),
            stale_assumptions: snapshot.stale_assumptions.slice(0, 4),
            conflicts: conflicts.map((c) => ({
              id: c.id,
              reason: c.reason,
              funnel_id: c.funnel_id,
            })),
            limitations: snapshot.limitations.slice(0, 4),
          })
        } catch {
          return {
            note: 'Strategic memory unavailable (migration may be pending).',
            health: null,
            patterns: [],
            open_questions: [],
            stale_assumptions: [],
            conflicts: [],
            limitations: [],
          }
        }
      })(),
    },
  })
}
