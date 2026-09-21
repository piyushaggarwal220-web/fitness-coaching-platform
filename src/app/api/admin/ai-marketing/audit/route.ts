import { NextResponse } from 'next/server'
import { requireMarketingAdmin } from '@/lib/ai-marketing/auth'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const auth = await requireMarketingAdmin()
  if (!auth.ok) return auth.response
  const limit = Math.min(200, Number(new URL(request.url).searchParams.get('limit') || 100))
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('marketing_audit_events')
    .select('*')
    .order('timestamp', { ascending: false })
    .limit(limit)
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  return NextResponse.json({ success: true, events: data ?? [] })
}
