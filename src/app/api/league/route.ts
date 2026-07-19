import { NextResponse } from 'next/server'
import { getLeagueSnapshotForClient } from '@/lib/league/service'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  }

  try {
    const snapshot = await getLeagueSnapshotForClient(supabase, user.id)
    return NextResponse.json({ success: true, ...snapshot })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load league'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function PATCH(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  }

  let body: { optIn?: boolean }
  try {
    body = (await request.json()) as { optIn?: boolean }
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  if (typeof body.optIn !== 'boolean') {
    return NextResponse.json({ error: 'optIn boolean is required' }, { status: 400 })
  }

  const { error } = await supabase
    .from('profiles')
    .update({
      league_opt_in: body.optIn,
      updated_at: new Date().toISOString(),
    })
    .eq('id', user.id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  try {
    const snapshot = await getLeagueSnapshotForClient(supabase, user.id)
    return NextResponse.json({ success: true, ...snapshot })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Saved, but failed to refresh league'
    return NextResponse.json({ success: true, optIn: body.optIn, warning: message })
  }
}
