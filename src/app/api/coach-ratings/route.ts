import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getRatingForMessage, submitCoachRating } from '@/lib/coach-ratings'
import type { CoachRatingValue } from '@/types/database'

export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const messageId = searchParams.get('messageId')?.trim()
  if (!messageId) {
    return NextResponse.json({ error: 'messageId required' }, { status: 400 })
  }

  const rating = await getRatingForMessage(supabase, messageId, user.id)
  return NextResponse.json({ rating })
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { messageId, coachId, rating, comment } = body

  if (!messageId || !coachId || !rating) {
    return NextResponse.json({ error: 'messageId, coachId, and rating required' }, { status: 400 })
  }

  const { data, error } = await submitCoachRating(supabase, {
    messageId,
    clientId: user.id,
    coachId,
    rating: rating as CoachRatingValue,
    comment,
  })

  if (error) return NextResponse.json({ error }, { status: 400 })
  return NextResponse.json({ rating: data })
}
