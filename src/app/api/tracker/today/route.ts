import { NextResponse } from 'next/server'
import { loadTodayTrackerView } from '@/lib/daily-tracker'
import { requireApiUser } from '@/lib/api-auth'

async function handle(force: boolean) {
  const auth = await requireApiUser()
  if (!auth.ok) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  }

  const { supabase, user } = auth

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  if (profileError || !profile) {
    return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
  }

  const { view, error } = await loadTodayTrackerView(supabase, user.id, profile, { force })

  if (error || !view) {
    return NextResponse.json({ error: error ?? 'Tracker unavailable' }, { status: 404 })
  }

  return NextResponse.json({ view })
}

export async function GET() {
  return handle(false)
}

/** Client-triggered rebuild of today's snapshot from the active plan ("Rebuild from plan"). */
export async function POST() {
  return handle(true)
}
