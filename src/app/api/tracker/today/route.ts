import { NextResponse } from 'next/server'
import { loadTodayTrackerView } from '@/lib/daily-tracker'
import { requireApiUser } from '@/lib/api-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import type { OnboardingProfile } from '@/types/database'

export const dynamic = 'force-dynamic'

const NO_STORE = { 'Cache-Control': 'no-store, max-age=0' }

async function handle(force: boolean) {
  const auth = await requireApiUser()
  if (!auth.ok) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401, headers: NO_STORE })
  }

  const { supabase, user } = auth

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  if (profileError || !profile) {
    return NextResponse.json({ error: 'Profile not found' }, { status: 404, headers: NO_STORE })
  }

  // Read the live active plan and write today's snapshot with the service role so
  // a client refresh cannot keep yesterday's stored diet after a coach edit.
  const admin = createAdminClient()
  const { view, error } = await loadTodayTrackerView(
    admin,
    user.id,
    profile as OnboardingProfile,
    { force }
  )

  if (error || !view) {
    return NextResponse.json(
      { error: error ?? 'Tracker unavailable' },
      { status: 404, headers: NO_STORE }
    )
  }

  return NextResponse.json({ view }, { headers: NO_STORE })
}

export async function GET() {
  return handle(false)
}

/** Force rebuild today's snapshot from the active plan (Refresh). */
export async function POST() {
  return handle(true)
}
