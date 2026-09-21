import { NextResponse } from 'next/server'
import { requireMarketingAdmin } from '@/lib/ai-marketing/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { notificationCategory } from '@/lib/jarvis/operator-present'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const auth = await requireMarketingAdmin()
  if (!auth.ok) return auth.response

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('jarvis_notifications')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(80)

  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })

  const notifications = (data ?? []).map((n) => ({
    ...n,
    category: notificationCategory(String(n.kind), String(n.title)),
  }))

  return NextResponse.json({
    success: true,
    notifications,
    unread: notifications.filter((n) => !n.read_at).length,
  })
}

export async function PATCH(request: Request) {
  const auth = await requireMarketingAdmin()
  if (!auth.ok) return auth.response

  const body = (await request.json().catch(() => ({}))) as {
    id?: string
    readAll?: boolean
  }
  const admin = createAdminClient()
  const now = new Date().toISOString()

  if (body.readAll) {
    const { error } = await admin
      .from('jarvis_notifications')
      .update({ read_at: now })
      .is('read_at', null)
    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  }

  if (!body.id) {
    return NextResponse.json({ success: false, error: 'id or readAll required' }, { status: 400 })
  }

  const { error } = await admin.from('jarvis_notifications').update({ read_at: now }).eq('id', body.id)
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
