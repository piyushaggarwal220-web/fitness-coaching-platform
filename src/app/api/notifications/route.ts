import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  markAllNotificationsRead,
  markNotificationRead,
} from '@/lib/notifications/service'
import { sendNotification } from '@/lib/notifications/dispatcher'
import { scheduleOpportunisticNotificationDrain } from '@/lib/notifications/drain'
import { safeInternalPathOrNull } from '@/lib/safe-navigation'
import type { NotificationType } from '@/types/database'

export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  scheduleOpportunisticNotificationDrain()

  const url = new URL(request.url)
  const unreadOnly = url.searchParams.get('unread') === 'true'

  let query = supabase
    .from('user_notifications')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(50)

  if (unreadOnly) query = query.is('read_at', null)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const { count } = await supabase
    .from('user_notifications')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .is('read_at', null)

  return NextResponse.json({ notifications: data, unreadCount: count ?? 0 })
}

export async function PATCH(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  scheduleOpportunisticNotificationDrain()

  const body = await request.json()

  if (body.markAll) {
    await markAllNotificationsRead(user.id)
    return NextResponse.json({ ok: true })
  }

  if (body.notificationId) {
    await markNotificationRead(body.notificationId, user.id)
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: 'notificationId or markAll required' }, { status: 400 })
}

type SendNotificationBody = {
  userId?: string
  type?: NotificationType
  title?: string
  body?: string
  actionUrl?: string
  metadata?: Record<string, unknown>
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: coach } = await supabase
    .from('coaches')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle()

  if (!coach?.id) {
    return NextResponse.json({ error: 'Coach access required' }, { status: 403 })
  }

  let body: SendNotificationBody
  try {
    body = (await request.json()) as SendNotificationBody
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const userId = body.userId?.trim()
  const type = body.type
  const title = body.title?.trim()
  const notifBody = body.body?.trim()

  if (!userId || !type || !title || !notifBody) {
    return NextResponse.json({ error: 'userId, type, title, and body are required' }, { status: 400 })
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('coach_id')
    .eq('id', userId)
    .maybeSingle()

  if (profile?.coach_id !== coach.id) {
    return NextResponse.json({ error: 'Client not assigned to this coach' }, { status: 403 })
  }

  const notification = await sendNotification({
    userId,
    type,
    title,
    body: notifBody,
    actionUrl: safeInternalPathOrNull(body.actionUrl) ?? undefined,
    metadata: body.metadata,
  })

  if (!notification) {
    return NextResponse.json({ error: 'Failed to send notification' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, notificationId: notification.id })
}
