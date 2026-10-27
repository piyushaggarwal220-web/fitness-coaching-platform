import { NextResponse } from 'next/server'
import { listPlannerThread, restorePlannerPlan, runPlannerTurn } from '@/lib/ai/client-planner'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'
export const maxDuration = 300

async function requireCoachClient(clientId: string) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'Authentication required' }, { status: 401 }) }

  const { data: coach } = await supabase.from('coaches').select('id').eq('user_id', user.id).maybeSingle()
  if (!coach?.id) return { error: NextResponse.json({ error: 'Coach access required' }, { status: 403 }) }

  const admin = createAdminClient()
  const { data: client } = await admin
    .from('profiles')
    .select('id, name')
    .eq('id', clientId)
    .eq('coach_id', coach.id)
    .maybeSingle()
  if (!client) return { error: NextResponse.json({ error: 'Client not found' }, { status: 404 }) }

  return { coachId: coach.id as string, clientName: (client.name as string | null) ?? 'Client', admin }
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params
  const clientId = id?.trim()
  if (!clientId) return NextResponse.json({ error: 'Client id is required' }, { status: 400 })

  const auth = await requireCoachClient(clientId)
  if ('error' in auth) return auth.error

  const url = new URL(request.url)
  const requestId = url.searchParams.get('request')?.trim() || null
  const checkinId = url.searchParams.get('checkin')?.trim() || null
  try {
    const thread = await listPlannerThread(auth.admin, {
      clientId,
      coachId: auth.coachId,
      requestId,
      checkinId,
    })
    return NextResponse.json({ clientName: auth.clientName, ...thread })
  } catch (error) {
    console.error('[coach/planner] load failed', error)
    return NextResponse.json({ error: 'Could not load this planner.' }, { status: 500 })
  }
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params
  const clientId = id?.trim()
  if (!clientId) return NextResponse.json({ error: 'Client id is required' }, { status: 400 })

  const auth = await requireCoachClient(clientId)
  if ('error' in auth) return auth.error

  let body: { message?: string; requestId?: string; checkinId?: string; action?: string; messageId?: string }
  try {
    body = (await request.json()) as {
      message?: string
      requestId?: string
      checkinId?: string
      action?: string
      messageId?: string
    }
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  if (body.action === 'restore') {
    const restored = await restorePlannerPlan({
      clientId,
      coachId: auth.coachId,
      messageId: body.messageId?.trim() || '',
    })
    if ('error' in restored) return NextResponse.json({ error: restored.error }, { status: restored.status })
    return NextResponse.json({ clientName: auth.clientName, ...restored })
  }

  const result = await runPlannerTurn({
    clientId,
    coachId: auth.coachId,
    message: body.message ?? '',
    requestId: body.requestId?.trim() || null,
    checkinId: body.checkinId?.trim() || null,
  })
  if ('error' in result) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ clientName: auth.clientName, ...result })
}
