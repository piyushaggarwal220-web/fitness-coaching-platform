import { NextResponse } from 'next/server'
import { requireApiUser } from '@/lib/api-auth'

type SubscriptionBody = {
  endpoint?: string
  expirationTime?: number | null
  keys?: { p256dh?: string; auth?: string }
}

function validSubscription(body: SubscriptionBody): body is Required<Pick<SubscriptionBody, 'endpoint' | 'keys'>> & SubscriptionBody {
  if (!body.endpoint || !body.keys?.p256dh || !body.keys.auth) return false
  try {
    return new URL(body.endpoint).protocol === 'https:'
  } catch {
    return false
  }
}

export async function GET() {
  const auth = await requireApiUser()
  if (!auth.ok) return auth.response
  return NextResponse.json({
    publicKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim() || null,
  })
}

export async function PUT(request: Request) {
  const auth = await requireApiUser()
  if (!auth.ok) return auth.response
  const body = await request.json().catch(() => null) as { endpoint?: string } | null
  if (!body?.endpoint) {
    return NextResponse.json({ registered: false })
  }

  const { count, error } = await auth.supabase
    .from('push_subscriptions')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', auth.user.id)
    .eq('endpoint', body.endpoint)
    .is('disabled_at', null)

  if (error) {
    return NextResponse.json({ error: 'Could not verify push subscription' }, { status: 500 })
  }
  return NextResponse.json({ registered: (count ?? 0) > 0 })
}

export async function POST(request: Request) {
  const auth = await requireApiUser()
  if (!auth.ok) return auth.response
  const body = await request.json().catch(() => null) as SubscriptionBody | null
  if (!body || !validSubscription(body)) {
    return NextResponse.json({ error: 'Invalid push subscription' }, { status: 400 })
  }
  const { error } = await auth.supabase.from('push_subscriptions').upsert({
    user_id: auth.user.id,
    endpoint: body.endpoint,
    p256dh: body.keys.p256dh,
    auth: body.keys.auth,
    expires_at: body.expirationTime ? new Date(body.expirationTime).toISOString() : null,
    disabled_at: null,
    user_agent: request.headers.get('user-agent')?.slice(0, 500) ?? null,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id,endpoint' })
  if (error) return NextResponse.json({ error: 'Could not save push subscription' }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(request: Request) {
  const auth = await requireApiUser()
  if (!auth.ok) return auth.response
  const body = await request.json().catch(() => null) as { endpoint?: string } | null
  if (!body?.endpoint) return NextResponse.json({ error: 'endpoint required' }, { status: 400 })
  await auth.supabase.from('push_subscriptions')
    .delete().eq('user_id', auth.user.id).eq('endpoint', body.endpoint)
  return NextResponse.json({ ok: true })
}
