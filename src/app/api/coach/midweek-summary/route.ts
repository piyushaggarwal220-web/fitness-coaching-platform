import { NextResponse } from 'next/server'
import {
  generateMidWeekAnalysis,
  loadCachedMidWeekSummary,
} from '@/lib/ai/midweek-analysis'
import { createClient } from '@/lib/supabase/server'
import type { Checkin, OnboardingProfile } from '@/types/database'

export const maxDuration = 60

type CoachCheckinContext = {
  coachId: string
  checkin: Checkin
  profile: OnboardingProfile
}

async function requireCoachForCheckin(
  checkinId: string
): Promise<CoachCheckinContext | { error: NextResponse }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: NextResponse.json({ error: 'Authentication required' }, { status: 401 }) }
  }

  const { data: coach } = await supabase.from('coaches').select('id').eq('user_id', user.id).maybeSingle()
  if (!coach?.id) {
    return { error: NextResponse.json({ error: 'Coach access required' }, { status: 403 }) }
  }

  const { data: checkin } = await supabase
    .from('checkins')
    .select('*')
    .eq('id', checkinId)
    .eq('coach_id', coach.id)
    .maybeSingle()

  if (!checkin) {
    return { error: NextResponse.json({ error: 'Check-in not found' }, { status: 404 }) }
  }

  if (checkin.checkin_type !== 'mid_week') {
    return { error: NextResponse.json({ error: 'Not a mid-week check-in' }, { status: 400 }) }
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', checkin.client_id)
    .maybeSingle()

  if (!profile) {
    return { error: NextResponse.json({ error: 'Client profile not found' }, { status: 404 }) }
  }

  return {
    coachId: coach.id,
    checkin: checkin as Checkin,
    profile: profile as OnboardingProfile,
  }
}

function isError(
  value: CoachCheckinContext | { error: NextResponse }
): value is { error: NextResponse } {
  return 'error' in value
}

export async function GET(request: Request) {
  const url = new URL(request.url)
  const checkinId = url.searchParams.get('checkinId')?.trim()
  if (!checkinId) {
    return NextResponse.json({ error: 'checkinId is required' }, { status: 400 })
  }

  const auth = await requireCoachForCheckin(checkinId)
  if (isError(auth)) return auth.error

  const summary = await loadCachedMidWeekSummary(checkinId)
  return NextResponse.json({
    summary,
    cached: Boolean(summary),
    checkinId,
  })
}

export async function POST(request: Request) {
  let body: { checkinId?: string; force?: boolean }
  try {
    body = (await request.json()) as { checkinId?: string; force?: boolean }
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const checkinId = body.checkinId?.trim()
  if (!checkinId) {
    return NextResponse.json({ error: 'checkinId is required' }, { status: 400 })
  }

  const auth = await requireCoachForCheckin(checkinId)
  if (isError(auth)) return auth.error

  try {
    const result = await generateMidWeekAnalysis({
      profile: auth.profile,
      checkin: auth.checkin,
      coachId: auth.coachId,
      force: Boolean(body.force),
    })
    return NextResponse.json({
      summary: result.summary,
      cached: result.cached,
      checkinId,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Mid-week analysis failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
