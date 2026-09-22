import { createAdminClient } from '@/lib/supabase/admin'
import { getAutonomyLevel } from '@/lib/ai-marketing/settings'
import { liveMetaExecutionEnabled } from '@/lib/ai-marketing/autonomy'
import {
  buildBusinessContextEngine,
  buildCostContextSlice,
} from '@/lib/jarvis/core/business-context'
import {
  formatMemoryForPrompt,
  planningHintsFromMemory,
  retrieveRelevantMemory,
} from '@/lib/jarvis/memory/retrieval'
import { listPendingApprovals } from '@/lib/jarvis/permissions/approval-engine'
import { ensureJarvisToolsRegistered } from '@/lib/jarvis/tools/builtins'
import { boundedToolCatalogForPrompt } from '@/lib/jarvis/tools/selection'

/**
 * OBSERVE phase context for a Jarvis turn.
 * Includes provenance-bearing business context, relevant (not full) memory,
 * follow-up history with prior structured tool results, and bounded tools.
 */
export async function buildJarvisContext(
  conversationId?: string | null,
  opts?: { objective?: string | null }
) {
  ensureJarvisToolsRegistered()

  const admin = createAdminClient()
  const objective = opts?.objective?.trim() || 'general business operations'

  const [businessCtx, costSlice, approvals, memoryPack, autonomy] = await Promise.all([
    buildBusinessContextEngine(),
    buildCostContextSlice(),
    listPendingApprovals(10),
    retrieveRelevantMemory({
      query: objective,
      limit: 8,
      currentInstruction: opts?.objective ?? null,
    }),
    getAutonomyLevel(),
  ])

  let history: { role: string; content: string; structured?: unknown }[] = []
  if (conversationId) {
    const { data } = await admin
      .from('jarvis_messages')
      .select('role, content, structured')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true })
      .limit(30)
    history = (data ?? []).map((m) => ({
      role: m.role,
      content: String(m.content).slice(0, 2000),
      // Prior tool_results enable follow-ups ("what about Instagram?") without restarting cold
      structured:
        m.role === 'assistant' && m.structured
          ? {
              thinking_summary: (m.structured as { thinking_summary?: string }).thinking_summary,
              tool_results: (
                (m.structured as { tool_results?: { tool: string; status: string; summary: string }[] })
                  .tool_results ?? []
              )
                .slice(-6)
                .map((t) => ({
                  tool: t.tool,
                  status: t.status,
                  summary: String(t.summary || '').slice(0, 300),
                })),
            }
          : undefined,
    }))
  }

  const memoryPrompt = formatMemoryForPrompt(memoryPack.memories, memoryPack.conflicts, {
    currentInstruction: opts?.objective ?? null,
  })
  const planningHints = planningHintsFromMemory(memoryPack.memories)

  let autonomousSlice: Record<string, unknown> = {
    note: 'Autonomous attention not loaded',
  }
  try {
    const { listOpenAttention, getLatestMorningBrief } = await import('@/lib/jarvis/autonomous')
    const [attention, brief] = await Promise.all([
      listOpenAttention(8),
      getLatestMorningBrief(),
    ])
    autonomousSlice = {
      open_attention: attention.map((a) => ({
        severity: a.severity,
        system: a.system,
        title: a.title,
        next_action: a.next_action,
        requires_approval: a.requires_approval,
        fingerprint: a.fingerprint,
      })),
      morning_brief_date: brief?.brief_date ?? null,
      morning_brief_preview: brief?.text?.slice(0, 400) ?? null,
      note: 'Bounded operator context — not a full database dump.',
    }
  } catch {
    autonomousSlice = { note: 'Phase 10 autonomous tables may be pending migration.' }
  }

  return {
    brand: 'LURVOX',
    role: 'Jarvis — AI Business Operator',
    loop: 'OBSERVE → DETECT → INVESTIGATE → DIAGNOSE → PLAN → CHECK PERMISSION → ACT → VERIFY → MEASURE → LEARN → REMEMBER',
    rules: businessCtx.rules,
    autonomy_level: autonomy,
    live_meta_execution: liveMetaExecutionEnabled(),
    business_context: {
      business: businessCtx.business,
      marketing: businessCtx.marketing,
      revenue: businessCtx.revenue,
      commerce: businessCtx.commerce,
      content: businessCtx.content,
      operations: businessCtx.operations,
    },
    autonomous_operator: autonomousSlice,
    // Back-compat fields used by older prompts / verify scripts
    meta_status: businessCtx.marketing.data.meta,
    funnels: businessCtx.business.data.active_funnels,
    overview_summary: businessCtx.marketing.data.overview,
    cost: costSlice.data.cost,
    budgets: costSlice.data.budgets,
    memory: memoryPrompt.relevant,
    memory_conflicts: memoryPrompt.conflicts,
    memory_planning_note: memoryPrompt.planning_note,
    learning_hints: planningHints,
    pending_jarvis_approvals: approvals.map((a) => ({
      id: a.id,
      action: a.action_label,
      risk: a.risk_level,
      tool: a.tool_name,
    })),
    tools: boundedToolCatalogForPrompt(objective),
    history,
    follow_up_note:
      'If the user asks a follow-up (e.g. "what about Instagram?"), interpret it in the context of the prior investigation in history.structured — do not restart from scratch.',
    learning_note:
      'Current user instruction overrides stored preferences for this turn. Operating rules constrain plans; lessons inform plans (do not auto-enforce as hard rules). Never claim causality from lessons.',
  }
}
