import { NextResponse, after } from 'next/server'
import { requireEntitledClientApiUser } from '@/lib/client-entitlement-guard'
import { logApiDev } from '@/lib/api-dev-log'
import { persistDraftGenerationStarted } from '@/lib/ai/draft-workflow-log'
import { generateMidWeekAnalysis } from '@/lib/ai/midweek-analysis'
import { generateWeeklyPlanDraft } from '@/lib/ai/weekly-plan-draft'
import { fetchCapturedPlanSlug, shouldAutoGenerateWeeklyPlanDraft } from '@/lib/plan-update-cadence'
import { shouldBypassCheckinScheduleServer } from '@/lib/config'
import {
  buildCheckinSummary,
  isWithinCheckinSubmissionWindow,
  isCheckinSubmissionWindowClosed,
  resolveCheckinSubmissionSlot,
} from '@/lib/checkin-schedule'
import { formatMidWeekCheckinChatMessage } from '@/lib/checkin-chat'
import { postCheckinToCoachChat } from '@/lib/coach-chat'
import { computeAutoReplyAt } from '@/lib/checkin-auto-reply-schedule'
import { invalidateForEvent } from '@/lib/ai/prompt-cache'
import { sendNotification, NotificationTemplates } from '@/lib/notifications/dispatcher'
import { createAdminClient } from '@/lib/supabase/admin'
import { parseAdherenceDays } from '@/lib/checkin-adherence-days'
import { areProgressPhotosOptional } from '@/lib/checkin'
import type { CheckinType } from '@/types/database'

/** Allow long-running weekly draft generation after the response returns. */
export const maxDuration = 300

type MidWeekBody = {
  checkinType: 'mid_week'
  diet_adherence: number
  workout_adherence: number
  energy_level: number
  sleep_quality: number
  stress_level: number
  hunger_level: number
  adherence_wins?: string | null
  adherence_struggles?: string | null
  pain_injuries?: string | null
  questions_for_coach?: string | null
  additional_comments?: string | null
  days_followed_diet: number
  days_followed_workout: number
  days_followed_sleep: number
  days_followed_water: number
  days_followed_steps: number
}

type WeeklyBody = {
  checkinType: 'weekly'
  weight: number
  chest: number
  thigh: number
  navel: number
  diet_adherence: number
  workout_adherence: number
  energy_level: number
  sleep_quality: number
  stress_level: number
  hunger_level: number
  motivation_level: number
  progress_rating: number
  progress_notes?: string | null
  digestion?: string | null
  pain_injuries?: string | null
  cardio_completed?: string | null
  additional_notes?: string | null
  progress_photo_front?: string | null
  progress_photo_side?: string | null
  progress_photo_back?: string | null
  extra_photos?: string[]
  plan_version?: number | null
  days_followed_diet: number
  days_followed_workout: number
  days_followed_sleep: number
  days_followed_water: number
  days_followed_steps: number
}

type SubmitBody = MidWeekBody | WeeklyBody

function isScore(n: unknown): n is number {
  return typeof n === 'number' && n >= 1 && n <= 10
}

function validateBody(body: SubmitBody, options?: { gender?: string | null }): string | null {
  if (body.checkinType === 'mid_week') {
    if (!isScore(body.diet_adherence)) return 'Invalid diet adherence.'
    if (!isScore(body.workout_adherence)) return 'Invalid workout adherence.'
    if (!isScore(body.energy_level)) return 'Invalid energy level.'
    if (!isScore(body.sleep_quality)) return 'Invalid sleep quality.'
    if (!isScore(body.stress_level)) return 'Invalid stress level.'
    if (!isScore(body.hunger_level)) return 'Invalid hunger level.'
    const midDays = parseAdherenceDays(body, 3)
    if (midDays.error) return midDays.error
    if (!body.adherence_wins?.trim()) return 'Adherence wins are required.'
    if (!body.adherence_struggles?.trim()) return 'Adherence struggles are required.'
    return null
  }

  if (!body.weight || body.weight <= 0) return 'Invalid weight.'
  if (!body.chest || body.chest <= 0) return 'Invalid chest measurement.'
  if (!body.thigh || body.thigh <= 0) return 'Invalid thigh measurement.'
  if (!body.navel || body.navel <= 0) return 'Invalid belly (navel) measurement.'
  if (!isScore(body.diet_adherence)) return 'Invalid diet adherence.'
  if (!isScore(body.workout_adherence)) return 'Invalid workout adherence.'
  const weeklyDays = parseAdherenceDays(body, 7)
  if (weeklyDays.error) return weeklyDays.error
  if (!isScore(body.energy_level)) return 'Invalid energy level.'
  if (!isScore(body.sleep_quality)) return 'Invalid sleep quality.'
  if (!isScore(body.stress_level)) return 'Invalid stress level.'
  if (!isScore(body.hunger_level)) return 'Invalid hunger level.'
  if (!isScore(body.motivation_level)) return 'Invalid motivation level.'
  if (!isScore(body.progress_rating)) return 'Invalid progress rating.'
  if (!body.progress_notes?.trim()) return 'Progress notes are required.'
  if (!areProgressPhotosOptional(options?.gender)) {
    if (!body.progress_photo_front || !body.progress_photo_side || !body.progress_photo_back) {
      return 'Progress photos are required.'
    }
  }
  return null
}

export async function POST(request: Request) {
  try {
    logApiDev('checkin_submit_started', {
      host: request.headers.get('host'),
      hasCookie: Boolean(request.headers.get('cookie')),
    })

    const auth = await requireEntitledClientApiUser()
    if (!auth.ok) {
      logApiDev('checkin_submit_auth_failed', { sessionFound: false })
      return auth.response
    }

    const { supabase, user } = auth
    logApiDev('checkin_submit_auth_ok', { userId: user.id, sessionFound: true })

    let body: SubmitBody
    try {
      body = (await request.json()) as SubmitBody
    } catch {
      return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 })
    }

    if (body.checkinType !== 'mid_week' && body.checkinType !== 'weekly') {
      return NextResponse.json({ success: false, error: 'Invalid check-in type.' }, { status: 400 })
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, name, email, gender, coach_id, onboarding_complete, checkin_schedule_started_at')
      .eq('id', user.id)
      .single()

    if (profileError || !profile) {
      return NextResponse.json({ success: false, error: 'Profile not found.' }, { status: 404 })
    }

    const validationError = validateBody(body, { gender: profile.gender })
    if (validationError) {
      return NextResponse.json({ success: false, error: validationError }, { status: 400 })
    }

    if (!profile.coach_id) {
      return NextResponse.json({ success: false, error: 'No coach assigned.' }, { status: 400 })
    }

    if (!profile.onboarding_complete) {
      return NextResponse.json({ success: false, error: 'Complete onboarding first.' }, { status: 400 })
    }

    if (!profile.checkin_schedule_started_at) {
      return NextResponse.json(
        {
          success: false,
          error: 'Your check-in schedule will begin when your coach delivers your first plan.',
        },
        { status: 403 }
      )
    }

    const { data: existingCheckins } = await supabase
      .from('checkins')
      .select('id, checkin_type, coaching_week, coaching_day, reviewed')
      .eq('client_id', user.id)

    const priorCheckins = existingCheckins ?? []
    const scheduled = resolveCheckinSubmissionSlot(
      profile.checkin_schedule_started_at,
      body.checkinType as CheckinType,
      priorCheckins
    )

    if (!scheduled) {
      return NextResponse.json({ success: false, error: 'Check-in already submitted for this week.' }, { status: 409 })
    }

    const today = new Date()

    if (!shouldBypassCheckinScheduleServer(request.headers.get('host'))) {
      if (isCheckinSubmissionWindowClosed(scheduled.dueDate, today)) {
        return NextResponse.json(
          {
            success: false,
            error:
              'This check-in window has closed (48 hours). Please wait for your next scheduled check-in.',
          },
          { status: 403 }
        )
      }
      if (!isWithinCheckinSubmissionWindow(scheduled.dueDate, today)) {
        return NextResponse.json(
          { success: false, error: 'This check-in is not available yet.' },
          { status: 403 }
        )
      }
    }

    const { data: existing } = await supabase
      .from('checkins')
      .select('id')
      .eq('client_id', user.id)
      .eq('coaching_week', scheduled.coachingWeek)
      .eq('checkin_type', body.checkinType)
      .maybeSingle()

    if (existing) {
      return NextResponse.json({ success: false, error: 'Check-in already submitted for this week.' }, { status: 409 })
    }

    const dueDateStr = scheduled.dueDate.toISOString().slice(0, 10)
    const baseRow = {
      client_id: user.id,
      coach_id: profile.coach_id,
      checkin_type: body.checkinType,
      coaching_week: scheduled.coachingWeek,
      coaching_day: scheduled.coachingDay,
      due_date: dueDateStr,
      due_at: scheduled.dueDate.toISOString(),
      diet_adherence: body.diet_adherence,
      workout_adherence: body.workout_adherence,
      energy_level: body.energy_level,
      sleep_quality: body.sleep_quality,
      stress_level: body.stress_level,
      hunger_level: body.hunger_level,
      days_followed_diet: body.days_followed_diet,
      days_followed_workout: body.days_followed_workout,
      days_followed_sleep: body.days_followed_sleep,
      days_followed_water: body.days_followed_water,
      days_followed_steps: body.days_followed_steps,
      adherence_score: body.diet_adherence,
      training_performance: body.workout_adherence,
      pain_injuries: body.pain_injuries ?? null,
      reviewed: false,
      // Schedules the automated reply; the coach can still answer first, which cancels it.
      auto_reply_at: computeAutoReplyAt(new Date()).toISOString(),
    }

    let insertRow: Record<string, unknown>

    if (body.checkinType === 'mid_week') {
      insertRow = {
        ...baseRow,
        adherence_wins: body.adherence_wins ?? null,
        adherence_struggles: body.adherence_struggles ?? null,
        questions_for_coach: body.questions_for_coach ?? null,
        notes: body.additional_comments ?? null,
      }
    } else {
      insertRow = {
        ...baseRow,
        weight: body.weight,
        chest: body.chest,
        thigh: body.thigh,
        navel: body.navel,
        waist: body.navel,
        motivation_level: body.motivation_level,
        progress_rating: body.progress_rating,
        progress_notes: body.progress_notes ?? null,
        digestion: body.digestion ?? null,
        cardio_completed: body.cardio_completed ?? null,
        notes: body.additional_notes ?? null,
        progress_photo_front: body.progress_photo_front ?? null,
        progress_photo_side: body.progress_photo_side ?? null,
        progress_photo_back: body.progress_photo_back ?? null,
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
      logApiDev('checkin_submit_insert_failed', { userId: user.id, error: insertError?.message })
      return NextResponse.json(
        { success: false, error: insertError?.message ?? 'Failed to save check-in.' },
        { status: 500 }
      )
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

      const { error: journeyError } = await supabase.from('journey_entries').insert({
        client_id: user.id,
        checkin_id: inserted.id,
        entry_date: new Date().toISOString(),
        weight: body.weight,
        photo_front: body.progress_photo_front ?? null,
        photo_side: body.progress_photo_side ?? null,
        photo_back: body.progress_photo_back ?? null,
        extra_photos: body.extra_photos ?? [],
        checkin_summary: summary,
        plan_version: body.plan_version ?? null,
      })

      if (journeyError) {
        logApiDev('checkin_submit_journey_failed', { userId: user.id, error: journeyError.message })
      }
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

    invalidateForEvent('checkin_submitted', user.id)
    invalidateForEvent('journey_updated', user.id)

    // Weekly check-ins must NEVER post into the shared client/coach chat.
    // They always go to the check-in review page + next-week AI draft instead.
    // Mid-week summaries still post to chat for quick coach visibility.
    if (body.checkinType === 'mid_week') {
      const chatMessage = formatMidWeekCheckinChatMessage({
        coachingWeek: scheduled.coachingWeek,
        dietAdherence: body.diet_adherence,
        workoutAdherence: body.workout_adherence,
        energyLevel: body.energy_level,
        sleepQuality: body.sleep_quality,
        stressLevel: body.stress_level,
        adherenceWins: body.adherence_wins,
        adherenceStruggles: body.adherence_struggles,
        painInjuries: body.pain_injuries,
        questionsForCoach: body.questions_for_coach,
      })

      void postCheckinToCoachChat(supabase, {
        clientId: user.id,
        coachId: profile.coach_id,
        message: chatMessage,
        checkinId: inserted.id,
        checkinType: 'mid_week',
      }).catch((err) => console.error('[checkin-submit] chat post failed:', err))

      after(async () => {
        try {
          const adminClient = createAdminClient()
          const [{ data: fullCheckin }, { data: fullProfile }] = await Promise.all([
            adminClient.from('checkins').select('*').eq('id', inserted.id).single(),
            adminClient.from('profiles').select('*').eq('id', user.id).single(),
          ])
          if (!fullCheckin || !fullProfile) return
          await generateMidWeekAnalysis({
            profile: fullProfile,
            checkin: fullCheckin,
            coachId: profile.coach_id,
          })
        } catch (err) {
          console.error('[checkin-submit] mid-week analysis failed:', err)
        }
      })
    }

    if (body.checkinType === 'weekly') {
      const planSlug = await fetchCapturedPlanSlug(user.id)
      const autoUpdate = shouldAutoGenerateWeeklyPlanDraft(planSlug, scheduled.coachingWeek)

      if (autoUpdate) {
        // Mark in-flight before the response returns so coaches see Generating immediately.
        void persistDraftGenerationStarted({
          clientId: user.id,
          coachId: profile.coach_id,
          checkinId: inserted.id,
          trigger: 'auto',
        }).catch((err) => console.error('[checkin-submit] draft start log failed:', err))

        after(() =>
          generateWeeklyPlanDraft({
            clientId: user.id,
            coachId: profile.coach_id,
            checkinId: inserted.id,
            coachingWeek: scheduled.coachingWeek,
            trigger: 'auto',
          }).catch((err) => console.error('[checkin-submit] auto draft failed:', err))
        )
      }
    }

    logApiDev('checkin_submit_success', {
      userId: user.id,
      coachId: profile.coach_id,
      checkinId: inserted.id,
      checkinType: body.checkinType,
      coachingWeek: scheduled.coachingWeek,
    })

    return NextResponse.json({
      success: true,
      checkinId: inserted.id,
      checkinType: body.checkinType,
      coachingWeek: scheduled.coachingWeek,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Check-in submission failed'
    logApiDev('checkin_submit_exception', { error: message })
    console.error('[checkin-submit] unhandled:', err)
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
