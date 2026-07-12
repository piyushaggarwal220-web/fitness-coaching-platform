import { NextResponse } from 'next/server'
import { buildCheckinSummary, buildScheduledCheckin, getCoachingWeek, getCoachingDay } from '@/lib/checkin-schedule'
import { sendNotification, NotificationTemplates } from '@/lib/notifications/service'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import type { CheckinType } from '@/types/database'

type MidWeekBody = {
  checkinType: 'mid_week'
  diet_adherence: number
  workout_adherence: number
  energy_level: number
  sleep_quality: number
  stress_level: number
  hunger_level: number
  pain_injuries?: string | null
  questions_for_coach?: string | null
  additional_comments?: string | null
}

type WeeklyBody = {
  checkinType: 'weekly'
  weight: number
  diet_adherence: number
  workout_adherence: number
  energy_level: number
  sleep_quality: number
  stress_level: number
  hunger_level: number
  motivation_level: number
  digestion?: string | null
  pain_injuries?: string | null
  cardio_completed?: string | null
  additional_notes?: string | null
  progress_photo_front: string
  progress_photo_side: string
  progress_photo_back: string
  extra_photos?: string[]
  plan_version?: number | null
}

type SubmitBody = MidWeekBody | WeeklyBody

function isScore(n: unknown): n is number {
  return typeof n === 'number' && n >= 1 && n <= 10
}

function validateBody(body: SubmitBody): string | null {
  if (body.checkinType === 'mid_week') {
    if (!isScore(body.diet_adherence)) return 'Invalid diet adherence.'
    if (!isScore(body.workout_adherence)) return 'Invalid workout adherence.'
    if (!isScore(body.energy_level)) return 'Invalid energy level.'
    if (!isScore(body.sleep_quality)) return 'Invalid sleep quality.'
    if (!isScore(body.stress_level)) return 'Invalid stress level.'
    if (!isScore(body.hunger_level)) return 'Invalid hunger level.'
    return null
  }

  if (!body.weight || body.weight <= 0) return 'Invalid weight.'
  if (!isScore(body.diet_adherence)) return 'Invalid diet adherence.'
  if (!isScore(body.workout_adherence)) return 'Invalid workout adherence.'
  if (!isScore(body.energy_level)) return 'Invalid energy level.'
  if (!isScore(body.sleep_quality)) return 'Invalid sleep quality.'
  if (!isScore(body.stress_level)) return 'Invalid stress level.'
  if (!isScore(body.hunger_level)) return 'Invalid hunger level.'
  if (!isScore(body.motivation_level)) return 'Invalid motivation level.'
  if (!body.progress_photo_front || !body.progress_photo_side || !body.progress_photo_back) {
    return 'Progress photos are required.'
  }
  return null
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  }

  let body: SubmitBody
  try {
    body = (await request.json()) as SubmitBody
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  if (body.checkinType !== 'mid_week' && body.checkinType !== 'weekly') {
    return NextResponse.json({ error: 'Invalid check-in type.' }, { status: 400 })
  }

  const validationError = validateBody(body)
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 })
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id, name, email, coach_id, onboarding_completed_at, onboarding_complete')
    .eq('id', user.id)
    .single()

  if (profileError || !profile) {
    return NextResponse.json({ error: 'Profile not found.' }, { status: 404 })
  }

  if (!profile.coach_id) {
    return NextResponse.json({ error: 'No coach assigned.' }, { status: 400 })
  }

  if (!profile.onboarding_completed_at && !profile.onboarding_complete) {
    return NextResponse.json({ error: 'Complete onboarding first.' }, { status: 400 })
  }

  const onboardingAt = profile.onboarding_completed_at ?? new Date().toISOString()
  const coachingDay = getCoachingDay(onboardingAt)
  const coachingWeek = getCoachingWeek(coachingDay)
  const scheduled = buildScheduledCheckin(onboardingAt, coachingWeek, body.checkinType as CheckinType)

  const today = new Date()
  const dueStart = new Date(scheduled.dueDate)
  dueStart.setHours(0, 0, 0, 0)
  const todayStart = new Date(today)
  todayStart.setHours(0, 0, 0, 0)

  if (todayStart.getTime() !== dueStart.getTime()) {
    return NextResponse.json({ error: 'This check-in is not available today.' }, { status: 403 })
  }

  const { data: existing } = await supabase
    .from('checkins')
    .select('id')
    .eq('client_id', user.id)
    .eq('coaching_week', coachingWeek)
    .eq('checkin_type', body.checkinType)
    .maybeSingle()

  if (existing) {
    return NextResponse.json({ error: 'Check-in already submitted for this week.' }, { status: 409 })
  }

  const dueDateStr = scheduled.dueDate.toISOString().slice(0, 10)
  const baseRow = {
    client_id: user.id,
    coach_id: profile.coach_id,
    checkin_type: body.checkinType,
    coaching_week: coachingWeek,
    coaching_day: scheduled.coachingDay,
    due_date: dueDateStr,
    diet_adherence: body.diet_adherence,
    workout_adherence: body.workout_adherence,
    energy_level: body.energy_level,
    sleep_quality: body.sleep_quality,
    stress_level: body.stress_level,
    hunger_level: body.hunger_level,
    adherence_score: body.diet_adherence,
    training_performance: body.workout_adherence,
    pain_injuries: body.pain_injuries ?? null,
    reviewed: false,
  }

  let insertRow: Record<string, unknown>

  if (body.checkinType === 'mid_week') {
    insertRow = {
      ...baseRow,
      questions_for_coach: body.questions_for_coach ?? null,
      notes: body.additional_comments ?? null,
    }
  } else {
    insertRow = {
      ...baseRow,
      weight: body.weight,
      motivation_level: body.motivation_level,
      digestion: body.digestion ?? null,
      cardio_completed: body.cardio_completed ?? null,
      notes: body.additional_notes ?? null,
      progress_photo_front: body.progress_photo_front,
      progress_photo_side: body.progress_photo_side,
      progress_photo_back: body.progress_photo_back,
      extra_photos: body.extra_photos ?? [],
      plan_version: body.plan_version ?? null,
    }
  }

  const { data: inserted, error: insertError } = await supabase
    .from('checkins')
    .insert(insertRow)
    .select('id')
    .single()

  if (insertError || !inserted) {
    return NextResponse.json({ error: insertError?.message ?? 'Failed to save check-in.' }, { status: 500 })
  }

  await supabase
    .from('profiles')
    .update({ checkin_awaiting: true, checkin_overdue: false })
    .eq('id', user.id)

  if (body.checkinType === 'weekly') {
    const summary = buildCheckinSummary({
      weight: body.weight,
      diet_adherence: body.diet_adherence,
      workout_adherence: body.workout_adherence,
      energy_level: body.energy_level,
      sleep_quality: body.sleep_quality,
      stress_level: body.stress_level,
      hunger_level: body.hunger_level,
      motivation_level: body.motivation_level,
      pain_injuries: body.pain_injuries ?? null,
      notes: body.additional_notes ?? null,
    })

    await supabase.from('journey_entries').insert({
      client_id: user.id,
      checkin_id: inserted.id,
      entry_date: new Date().toISOString(),
      weight: body.weight,
      photo_front: body.progress_photo_front,
      photo_side: body.progress_photo_side,
      photo_back: body.progress_photo_back,
      extra_photos: body.extra_photos ?? [],
      checkin_summary: summary,
      plan_version: body.plan_version ?? null,
    })
  }

  const admin = createAdminClient()
  const { data: coach } = await admin
    .from('coaches')
    .select('user_id')
    .eq('id', profile.coach_id)
    .maybeSingle()

  const clientName = profile.name || profile.email || 'A client'
  if (coach?.user_id) {
    const template = NotificationTemplates.checkinSubmitted(clientName, body.checkinType)
    await sendNotification({
      userId: coach.user_id,
      ...template,
      metadata: { checkinId: inserted.id, clientId: user.id, checkinType: body.checkinType },
      actionUrl: `/coach/checkin/${inserted.id}`,
    })
  }

  return NextResponse.json({
    success: true,
    checkinId: inserted.id,
    checkinType: body.checkinType,
    coachingWeek,
  })
}
