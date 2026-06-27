import { NextResponse } from 'next/server'
import { isDevToolkitEnabledServer } from '@/lib/dev-mode'
import { runSeedAction, type SeedAction } from '@/lib/dev-seeds'

function assertDevToolkitAccess() {
  if (!isDevToolkitEnabledServer()) {
    return NextResponse.json(
      { error: 'Developer toolkit is disabled outside development' },
      { status: 403 }
    )
  }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json(
      { error: 'SUPABASE_SERVICE_ROLE_KEY is required for dev operations' },
      { status: 500 }
    )
  }

  return null
}

export async function POST(request: Request) {
  const denied = assertDevToolkitAccess()
  if (denied) return denied

  let body: { action?: SeedAction; clientId?: string; coachId?: string; planId?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const action = body.action
  if (!action) {
    return NextResponse.json({ error: 'action is required' }, { status: 400 })
  }

  try {
    const result = await runSeedAction(action, {
      clientId: body.clientId ?? '',
      coachId: body.coachId ?? '',
      planId: body.planId ?? '',
    })
    return NextResponse.json(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Seed action failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function GET() {
  const denied = assertDevToolkitAccess()
  if (denied) return denied

  try {
    const result = await runSeedAction('list_entities')
    return NextResponse.json(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to list entities'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
