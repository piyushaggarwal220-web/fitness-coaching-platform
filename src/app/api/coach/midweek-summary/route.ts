import { NextResponse } from 'next/server'
import {
  backfillMidWeekReplies,
  generateMidWeekAnalysis,
  loadCachedMidWeekPack,
} from '@/lib/ai/midweek-analysis'
import { createClient } from '@/lib/supabase/server'
import type { Checkin, OnboardingProfile } from '@/types/database'

export const maxDuration = 300

type CoachCheckinContext = {
  coachId: string
  checkin: Checkin
  profile: OnboardingProfile
}

async function requireCoach(): Promise<
  { coachId: string } | { error: NextResponse }
> {
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

  return { coachId: coach.id }
}

async function requireCoachForCheckin(
  checkinId: string
): Promise<CoachCheckinContext | { error: NextResponse }> {
  const auth = await requireCoach()
  if ('error' in auth) return auth

  const supabase = await createClient()
  const { data: checkin } = await supabase
    .from('checkins')
    .select('*')
    .eq('id', checkinId)
    .eq('coach_id', auth.coachId)
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
    coachId: auth.coachId,
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

  const pack = await loadCachedMidWeekPack(checkinId)
  return NextResponse.json({
    summary: pack?.summary ?? null,
    clientReply: pack?.clientReply ?? null,
    cached: Boolean(pack?.summary || pack?.clientReply),
    checkinId,
  })
}

export async function POST(request: Request) {
  let body: { checkinId?: string; force?: boolean; backfill?: boolean; limit?: number }
  try {
    body = (await request.json()) as {
      checkinId?: string
      force?: boolean
      backfill?: boolean
      limit?: number
    }
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  // Batch generate missing replies for this coach's unreviewed mid-weeks
  if (body.backfill) {
    const auth = await requireCoach()
    if ('error' in auth) return auth.error

    try {
      const result = await backfillMidWeekReplies({
        coachId: auth.coachId,
        limit: body.limit,
        force: Boolean(body.force),
      })
      return NextResponse.json({ ok: true, ...result })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Backfill failed'
      return NextResponse.json({ error: message }, { status: 500 })
    }
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
      clientReply: result.clientReply,
      cached: result.cached,
      checkinId,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Mid-week analysis failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
