/**
 * Phase 12 execution status API — admin only. No secrets.
 */

import { NextResponse } from 'next/server'
import { requireMarketingAdmin } from '@/lib/ai-marketing/auth'
import { liveMetaExecutionEnabled } from '@/lib/ai-marketing/autonomy'
import { liveInstagramPublishingEnabled } from '@/lib/jarvis/instagram'
import { getAutonomyLevel } from '@/lib/ai-marketing/settings'
import { getExecutionConfig } from '@/lib/jarvis/execution/policy/config'
import { listRecentReceipts, getExecutionReceipt } from '@/lib/jarvis/execution/receipts'
import { explainExecutionDecision } from '@/lib/jarvis/execution/explain'
import { setJarvisSetting } from '@/lib/jarvis/cost/governor'
import { writeMarketingAudit } from '@/lib/ai-marketing/audit'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const auth = await requireMarketingAdmin()
  if (!auth.ok) return auth.response

  const url = new URL(req.url)
  const receiptId = url.searchParams.get('receiptId')
  if (receiptId) {
    const receipt = await getExecutionReceipt(receiptId)
    return NextResponse.json({ success: true, receipt })
  }

  const [config, autonomy, receipts] = await Promise.all([
    getExecutionConfig(),
    getAutonomyLevel().catch(() => 2),
    listRecentReceipts(40),
  ])

  let openIncidents: unknown[] = []
  try {
    const admin = createAdminClient()
    const { data } = await admin
      .from('jarvis_execution_incidents')
      .select('id, fingerprint, system, tool_name, error_class, message, occurrence_count, status, last_seen_at')
      .eq('status', 'open')
      .order('last_seen_at', { ascending: false })
      .limit(20)
    openIncidents = data ?? []
  } catch {
    openIncidents = []
  }

  return NextResponse.json({
    success: true,
    execution: {
      ...config,
      autonomy_level: autonomy,
      live_meta_execution: liveMetaExecutionEnabled(),
      live_instagram_publishing: liveInstagramPublishingEnabled(),
      jarvis_cannot_enable_live_flags: true,
      jarvis_cannot_clear_kill_switch: true,
    },
    receipts: receipts.map((r) => ({
      id: r.id,
      tool_name: r.tool_name,
      system: r.system,
      action_class: r.action_class,
      status: r.status,
      policy_decision: r.policy_decision,
      policy_reason: r.policy_reason,
      estimated_cost_usd: r.estimated_cost_usd,
      actual_cost_usd: r.actual_cost_usd,
      verification_status: r.verification_status,
      dry_run: r.dry_run,
      shadow: r.shadow,
      created_at: r.created_at,
      completed_at: r.completed_at,
    })),
    incidents: openIncidents,
  })
}

export async function POST(req: Request) {
  const auth = await requireMarketingAdmin()
  if (!auth.ok) return auth.response

  const body = (await req.json().catch(() => ({}))) as {
    action?: string
    kill_switch?: boolean
    mode?: string
    dry_run?: boolean
    shadow_mode?: boolean
    question?: string
    receiptId?: string
  }

  if (body.action === 'explain') {
    const receipt = body.receiptId ? await getExecutionReceipt(body.receiptId) : null
    const explained = await explainExecutionDecision({
      question: body.question || 'Why?',
      receipt,
    })
    return NextResponse.json({ success: true, ...explained })
  }

  if (body.action === 'set_controls') {
    // Admin-only configuration — Jarvis tools cannot call this
    if (typeof body.kill_switch === 'boolean') {
      await setJarvisSetting('execution_kill_switch', body.kill_switch, auth.user.id, {
        allowProtected: true,
      })
    }
    if (body.mode && ['approval', 'guarded', 'shadow', 'dry_run'].includes(body.mode)) {
      await setJarvisSetting('execution_mode', body.mode, auth.user.id, { allowProtected: true })
    }
    if (typeof body.dry_run === 'boolean') {
      await setJarvisSetting('execution_dry_run', body.dry_run, auth.user.id, { allowProtected: true })
    }
    if (typeof body.shadow_mode === 'boolean') {
      await setJarvisSetting('execution_shadow_mode', body.shadow_mode, auth.user.id, {
        allowProtected: true,
      })
    }
    await writeMarketingAudit({
      agent: 'admin',
      decision: 'execution_controls_updated',
      action: 'execution.set_controls',
      actor_id: auth.user.id,
      reasoning: JSON.stringify({
        kill_switch: body.kill_switch,
        mode: body.mode,
        dry_run: body.dry_run,
        shadow_mode: body.shadow_mode,
      }),
    })
    const config = await getExecutionConfig()
    return NextResponse.json({ success: true, execution: config })
  }

  return NextResponse.json({ success: false, error: 'unsupported_action' }, { status: 400 })
}
