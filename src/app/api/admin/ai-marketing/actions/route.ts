import { NextResponse } from 'next/server'
import { requireMarketingAdmin } from '@/lib/ai-marketing/auth'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const auth = await requireMarketingAdmin()
  if (!auth.ok) return auth.response
  const url = new URL(request.url)
  const status = url.searchParams.get('status') || 'pending'
  const admin = createAdminClient()

  let actionsQuery = admin
    .from('marketing_ai_actions')
    .select('*, marketing_ai_decisions(*)')
    .order('created_at', { ascending: false })
    .limit(50)
  if (status !== 'all') actionsQuery = actionsQuery.eq('approval_status', status)

  const { data: actions, error } = await actionsQuery
  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }

  const { data: decisions } = await admin
    .from('marketing_ai_decisions')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(50)

  return NextResponse.json({
    success: true,
    actions: actions ?? [],
    decisions: decisions ?? [],
  })
}
