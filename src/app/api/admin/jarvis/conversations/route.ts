import { NextResponse } from 'next/server'
import { requireMarketingAdmin } from '@/lib/ai-marketing/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { humanToolLabel, toolFamily } from '@/lib/jarvis/operator-present'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function publicMessage(row: Record<string, unknown>) {
  const structured = (row.structured || {}) as Record<string, unknown>
  const toolResults = Array.isArray(structured.tool_results)
    ? (structured.tool_results as { tool?: string; status?: string; summary?: string }[]).map((t) => ({
        tool: t.tool,
        family: t.tool ? toolFamily(t.tool) : 'System',
        label: t.tool ? humanToolLabel(t.tool) : 'Tool',
        status: t.status,
        summary: typeof t.summary === 'string' ? t.summary.slice(0, 240) : undefined,
      }))
    : []

  return {
    id: row.id,
    role: row.role,
    content: row.content,
    approval_ids: row.approval_ids,
    cost_usd: row.cost_usd,
    created_at: row.created_at,
    thinking_summary:
      typeof structured.thinking_summary === 'string' ? structured.thinking_summary : undefined,
    tool_activity: toolResults,
  }
}

export async function GET(request: Request) {
  const auth = await requireMarketingAdmin()
  if (!auth.ok) return auth.response

  const url = new URL(request.url)
  const conversationId = url.searchParams.get('conversationId')
  const q = url.searchParams.get('q')?.trim().toLowerCase()
  const admin = createAdminClient()

  if (conversationId) {
    const [{ data: messages, error }, { data: tasks }] = await Promise.all([
      admin
        .from('jarvis_messages')
        .select('id, role, content, structured, approval_ids, cost_usd, created_at')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true })
        .limit(200),
      admin
        .from('jarvis_tasks')
        .select('id, objective, status, spent_usd, created_at, completed_at')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: false })
        .limit(10),
    ])
    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }
    return NextResponse.json({
      success: true,
      messages: (messages ?? []).map((m) => publicMessage(m)),
      tasks: tasks ?? [],
    })
  }

  const query = admin
    .from('jarvis_conversations')
    .select('id, title, status, updated_at, created_at')
    .order('updated_at', { ascending: false })
    .limit(50)

  const { data, error } = await query
  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
  const rows = data ?? []
  const filtered = q
    ? rows.filter((c) => String(c.title || '').toLowerCase().includes(q))
    : rows
  return NextResponse.json({ success: true, conversations: filtered })
}

export async function POST(request: Request) {
  const auth = await requireMarketingAdmin()
  if (!auth.ok) return auth.response

  const body = (await request.json().catch(() => ({}))) as { title?: string }
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('jarvis_conversations')
    .insert({
      title: body.title?.trim() || 'New conversation',
      created_by: auth.user.id,
    })
    .select('id, title, status, updated_at, created_at')
    .maybeSingle()
  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
  return NextResponse.json({ success: true, conversation: data })
}

export async function PATCH(request: Request) {
  const auth = await requireMarketingAdmin()
  if (!auth.ok) return auth.response
  const body = (await request.json().catch(() => ({}))) as {
    conversationId?: string
    status?: 'active' | 'archived'
  }
  if (!body.conversationId || !body.status) {
    return NextResponse.json(
      { success: false, error: 'conversationId and status required' },
      { status: 400 }
    )
  }
  const admin = createAdminClient()
  const { error } = await admin
    .from('jarvis_conversations')
    .update({ status: body.status, updated_at: new Date().toISOString() })
    .eq('id', body.conversationId)
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
