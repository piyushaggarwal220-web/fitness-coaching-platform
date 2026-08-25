import { NextResponse } from 'next/server'
import { loadManualPlanJobStatus } from '@/lib/coach/background-initial-plan'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 })

  const { data: coach } = await supabase.from('coaches').select('id').eq('user_id', user.id).maybeSingle()
  if (!coach?.id) return NextResponse.json({ error: 'Coach access required' }, { status: 403 })

  const clientId = new URL(request.url).searchParams.get('clientId')?.trim()
  if (!clientId) return NextResponse.json({ error: 'clientId is required' }, { status: 400 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('id')
    .eq('id', clientId)
    .eq('coach_id', coach.id)
    .maybeSingle()
  if (!profile) return NextResponse.json({ error: 'Client not found' }, { status: 404 })

  const status = await loadManualPlanJobStatus(clientId, coach.id)
  return NextResponse.json(status)
}
