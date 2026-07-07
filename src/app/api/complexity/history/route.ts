import { NextResponse } from 'next/server'
import { isAdminRole } from '@/lib/roles'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  }

  const url = new URL(request.url)
  const clientId = url.searchParams.get('clientId')?.trim()
  if (!clientId) {
    return NextResponse.json({ error: 'clientId is required.' }, { status: 400 })
  }

  const { data: actor } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
  const isAdmin = actor?.role ? isAdminRole(actor.role) : false

  if (!isAdmin && user.id !== clientId) {
    const { data: coach } = await supabase.from('coaches').select('id').eq('user_id', user.id).maybeSingle()
    if (!coach?.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { data: client } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', clientId)
      .eq('coach_id', coach.id)
      .maybeSingle()

    if (!client) {
      return NextResponse.json({ error: 'Client not found.' }, { status: 404 })
    }
  }

  const { data, error } = await supabase
    .from('complexity_score_history')
    .select('*')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })
    .limit(52)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ history: data ?? [] })
}
