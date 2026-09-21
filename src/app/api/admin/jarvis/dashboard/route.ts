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
      meta: context.meta_status,
      health: system?.health ?? null,
      integrations: system?.integrations ?? [],
      capabilities: system?.capabilities ?? null,
    },
  })
}
