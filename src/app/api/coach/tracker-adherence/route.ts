import { NextResponse } from 'next/server'
import { loadClientAdherenceSummary, loadCoachAdherenceSummaries } from '@/lib/daily-tracker'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  }

  const { data: coach } = await supabase.from('coaches').select('id').eq('user_id', user.id).maybeSingle()
  if (!coach?.id) {
    return NextResponse.json({ error: 'Coach access required' }, { status: 403 })
  }

  const url = new URL(request.url)
  const clientId = url.searchParams.get('clientId')?.trim()

  const { data: clients } = await supabase
    .from('profiles')
    .select('id, name')
    .eq('coach_id', coach.id)

  const list = clients ?? []

  // Single-client detail keeps full missed-meal/workout accounting.
  if (clientId) {
    const target = list.find((c) => c.id === clientId)
    if (!target) {
      return NextResponse.json({ summaries: [] })
    }
    const summary = await loadClientAdherenceSummary(supabase, target.id, 7)
    return NextResponse.json({
      summaries: [{ clientName: target.name, ...summary }],
    })
  }

  const summaries = await loadCoachAdherenceSummaries(supabase, list, 7)
  summaries.sort((a, b) => a.overallAverage - b.overallAverage)

  return NextResponse.json({ summaries })
}
