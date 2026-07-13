import { NextResponse } from 'next/server'
import { loadTodayTrackerView } from '@/lib/daily-tracker'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  if (profileError || !profile) {
    return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
  }

  const { view, error } = await loadTodayTrackerView(supabase, user.id, profile)

  if (error || !view) {
    return NextResponse.json({ error: error ?? 'Tracker unavailable' }, { status: 404 })
  }

  return NextResponse.json({ view })
}
