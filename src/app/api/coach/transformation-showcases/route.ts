import { NextResponse } from 'next/server'
import { requireApiUser } from '@/lib/api-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { loadTransformationShowcases, nominateClientForShowcase } from '@/lib/transformation-showcases'

export async function GET() {
  const auth = await requireApiUser()
  if (!auth.ok) return auth.response

  const { data: coach, error: coachError } = await auth.supabase
    .from('coaches')
    .select('id')
    .eq('user_id', auth.user.id)
    .maybeSingle()

  if (coachError || !coach?.id) {
    return NextResponse.json({ error: 'Coach access required' }, { status: 403 })
  }

  const admin = createAdminClient()
  const showcases = await loadTransformationShowcases(admin, { coachId: coach.id })
  return NextResponse.json({ showcases })
}

export async function POST(request: Request) {
  const auth = await requireApiUser()
  if (!auth.ok) return auth.response

  const body = await request.json().catch(() => null) as { clientId?: string; quote?: string } | null
  const clientId = body?.clientId?.trim()
  if (!clientId) {
    return NextResponse.json({ error: 'clientId required' }, { status: 400 })
  }

  const { data: coach, error: coachError } = await auth.supabase
    .from('coaches')
    .select('id')
    .eq('user_id', auth.user.id)
    .maybeSingle()

  if (coachError || !coach?.id) {
    return NextResponse.json({ error: 'Coach access required' }, { status: 403 })
  }

  const { data: client } = await auth.supabase
    .from('profiles')
    .select('id, coach_id')
    .eq('id', clientId)
    .maybeSingle()

  if (!client || client.coach_id !== coach.id) {
    return NextResponse.json({ error: 'Client not found on your roster' }, { status: 404 })
  }

  const admin = createAdminClient()
  const result = await nominateClientForShowcase(admin, {
    clientId,
    coachId: coach.id,
    nominatedBy: auth.user.id,
    quote: body?.quote ?? null,
  })

  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: 400 })
  }
  return NextResponse.json({ id: result.id }, { status: 201 })
}
