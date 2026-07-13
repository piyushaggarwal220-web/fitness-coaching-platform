import { NextResponse } from 'next/server'
import { loadClientAdherenceSummary } from '@/lib/daily-tracker'
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
  const targets = clientId ? list.filter((c) => c.id === clientId) : list

  const summaries = await Promise.all(
    targets.map(async (client) => {
      const summary = await loadClientAdherenceSummary(supabase, client.id, 7)
      return {
        clientName: client.name,
        ...summary,
      }
    })
  )

  summaries.sort((a, b) => a.overallAverage - b.overallAverage)

  return NextResponse.json({ summaries })
}
