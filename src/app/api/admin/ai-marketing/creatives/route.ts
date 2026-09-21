import { NextResponse } from 'next/server'
import { requireMarketingAdmin } from '@/lib/ai-marketing/auth'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const auth = await requireMarketingAdmin()
  if (!auth.ok) return auth.response

  const url = new URL(request.url)
  const status = url.searchParams.get('status')
  const type = url.searchParams.get('type')
  const funnelId = url.searchParams.get('funnelId')
  const limit = Math.min(100, Number(url.searchParams.get('limit') || 50))

  const admin = createAdminClient()
  let query = admin
    .from('marketing_creatives')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (status) query = query.eq('status', status)
  if (type) query = query.eq('type', type)
  if (funnelId) query = query.eq('funnel_id', funnelId)

  const { data, error } = await query
  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
  return NextResponse.json({ success: true, creatives: data ?? [] })
}

export async function PATCH(request: Request) {
  const auth = await requireMarketingAdmin()
  if (!auth.ok) return auth.response

  const body = (await request.json()) as {
    id?: string
    status?: string
    headline?: string
    primary_text?: string
    description?: string
    hook?: string
    cta?: string
  }

  if (!body.id) {
    return NextResponse.json({ success: false, error: 'id required' }, { status: 400 })
  }

  const allowedStatus = new Set([
    'draft',
    'generated',
    'approved',
    'rejected',
    'ready_for_meta',
    'in_test',
    'winner',
    'loser',
    'retired',
    'archived',
  ])

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (body.status) {
    if (!allowedStatus.has(body.status)) {
      return NextResponse.json({ success: false, error: 'Invalid status' }, { status: 400 })
    }
    patch.status = body.status
  }
  for (const key of ['headline', 'primary_text', 'description', 'hook', 'cta'] as const) {
    if (typeof body[key] === 'string') patch[key] = body[key]
  }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('marketing_creatives')
    .update(patch)
    .eq('id', body.id)
    .select('*')
    .maybeSingle()

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
  return NextResponse.json({ success: true, creative: data })
}
