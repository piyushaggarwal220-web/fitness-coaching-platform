import type { SupabaseClient } from '@supabase/supabase-js'
import type { Checkin, JourneyEntry, Plan, Profile } from '@/types/database'
import { parseCoachResponse } from '@/lib/checkin'

function buildMidWeekJourneyDescription(checkin: Checkin): string {
  const parts: string[] = []
  if (checkin.diet_adherence != null) parts.push(`Diet ${checkin.diet_adherence}/10`)
  if (checkin.workout_adherence != null) parts.push(`Workout ${checkin.workout_adherence}/10`)
  if (checkin.energy_level != null) parts.push(`Energy ${checkin.energy_level}/10`)
  return parts.join(' · ') || 'Mid-week progress check-in.'
}

export type JourneyMilestone = {
  id: string
  type: 'onboarding' | 'plan' | 'checkin' | 'workout' | 'coach_comment' | 'journey_entry'
  title: string
  description: string
  date: string
  icon: string
}

export type WeightEntry = {
  date: string
  weight: number
  source: 'profile' | 'checkin'
}

export type MeasurementEntry = {
  date: string
  waist: number | null
  chest: number | null
  thigh: number | null
  navel: number | null
  weight: number | null
}

export type JourneyWeeklyEntry = {
  id: string
  date: string
  weight: number | null
  coachingWeek: number | null
  photos: { front?: string; side?: string; back?: string; extra?: string[] }
  coachComment: string | null
  checkinSummary: string | null
  planVersion: number | null
  checkinId: string
}

export type ProgressJourneyData = {
  milestones: JourneyMilestone[]
  weeklyEntries: JourneyWeeklyEntry[]
  weightHistory: WeightEntry[]
  measurements: MeasurementEntry[]
  progressPhotos: { date: string; front?: string; side?: string; back?: string }[]
  coachComments: { date: string; comment: string; checkinId: string }[]
  stats: {
    totalCheckins: number
    totalWorkouts: number
    totalWorkoutMinutes: number
    totalWorkoutCalories: number
    avgWorkoutDuration: number
    startWeight: number | null
    currentWeight: number | null
    weightChange: number | null
    weeksActive: number
  }
  recentWorkouts: { id: string; name: string; duration: number; date: string }[]
}

export async function loadProgressJourney(
  supabase: SupabaseClient,
  userId: string
): Promise<ProgressJourneyData> {
  const [profileRes, checkinsRes, journeyRes, plansRes, workoutsRes] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', userId).single(),
    supabase
      .from('checkins')
      .select('*')
      .eq('client_id', userId)
      .order('submitted_at', { ascending: true }),
    supabase
      .from('journey_entries')
      .select('*')
      .eq('client_id', userId)
      .order('entry_date', { ascending: true }),
    supabase
      .from('plans')
      .select('*')
      .eq('client_id', userId)
      .order('created_at', { ascending: true }),
    supabase
      .from('workouts')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: true }),
  ])

  const profile = profileRes.data as Profile | null
  const checkins = (checkinsRes.data ?? []) as Checkin[]
  const journeyEntries = (journeyRes.data ?? []) as JourneyEntry[]
  const plans = (plansRes.data ?? []) as Plan[]
  const workouts = workoutsRes.data ?? []

  const weeklyCheckins = checkins.filter((c) => c.checkin_type === 'weekly')
  const checkinById = new Map(checkins.map((c) => [c.id, c]))

  const milestones: JourneyMilestone[] = []
  const weightHistory: WeightEntry[] = []
  const measurements: MeasurementEntry[] = []
  const progressPhotos: ProgressJourneyData['progressPhotos'] = []
  const coachComments: ProgressJourneyData['coachComments'] = []
  const weeklyEntries: JourneyWeeklyEntry[] = []

  if (profile?.onboarding_completed_at) {
    milestones.push({
      id: 'onboarding',
      type: 'onboarding',
      title: 'Journey Started',
      description: 'Completed onboarding and joined the coaching program.',
      date: profile.onboarding_completed_at,
      icon: '🚀',
    })
  }

  if (profile?.weight) {
    const w = parseFloat(String(profile.weight))
    if (!isNaN(w)) {
      weightHistory.push({ date: profile.onboarding_completed_at ?? profile.updated_at ?? '', weight: w, source: 'profile' })
    }
  }

  if (profile?.progress_photo_front || profile?.progress_photo_side || profile?.progress_photo_back) {
    progressPhotos.push({
      date: profile.onboarding_completed_at ?? '',
      front: profile.progress_photo_front ?? undefined,
      side: profile.progress_photo_side ?? undefined,
      back: profile.progress_photo_back ?? undefined,
    })
  }

  for (const plan of plans) {
    if (plan.delivered_at) {
      milestones.push({
        id: `plan-${plan.id}`,
        type: 'plan',
        title: `Plan Delivered: ${plan.title}`,
        description: plan.phase ? `Phase: ${plan.phase}` : 'Your personalized coaching plan was delivered.',
        date: plan.delivered_at,
        icon: '📋',
      })
    }
  }

  for (const checkin of checkins) {
    if (checkin.checkin_type === 'mid_week') {
      const week = checkin.coaching_week ?? (checkin.coaching_day ? Math.ceil(checkin.coaching_day / 7) : null)
      milestones.push({
        id: `midweek-${checkin.id}`,
        type: 'checkin',
        title: week ? `Week ${week} · Mid-Week Check-in` : 'Mid-Week Check-in',
        description: buildMidWeekJourneyDescription(checkin),
        date: checkin.submitted_at,
        icon: '📋',
      })
    }
  }

  for (const entry of journeyEntries) {
    const checkin = checkinById.get(entry.checkin_id)
    const coachResponse = checkin ? parseCoachResponse(checkin.coach_response) : { feedback: '', action_items: '' }
    const coachComment = coachResponse.feedback || null

    weeklyEntries.push({
      id: entry.id,
      date: entry.entry_date,
      weight: entry.weight,
      coachingWeek: checkin?.coaching_week ?? null,
      photos: {
        front: entry.photo_front ?? undefined,
        side: entry.photo_side ?? undefined,
        back: entry.photo_back ?? undefined,
        extra: Array.isArray(entry.extra_photos) ? entry.extra_photos : undefined,
      },
      coachComment,
      checkinSummary: entry.checkin_summary,
      planVersion: entry.plan_version,
      checkinId: entry.checkin_id,
    })

    milestones.push({
      id: `journey-${entry.id}`,
      type: 'journey_entry',
      title: checkin?.coaching_week
        ? `Week ${checkin.coaching_week} · Weekly Check-in`
        : 'Weekly Check-in',
      description: entry.checkin_summary?.slice(0, 80) ?? 'Weekly progress check-in.',
      date: entry.entry_date,
      icon: '✅',
    })

    if (entry.weight != null) {
      weightHistory.push({ date: entry.entry_date, weight: entry.weight, source: 'checkin' })
    }

    measurements.push({
      date: entry.entry_date,
      waist: checkin?.navel ?? checkin?.waist ?? null,
      chest: checkin?.chest ?? null,
      thigh: checkin?.thigh ?? null,
      navel: checkin?.navel ?? checkin?.waist ?? null,
      weight: entry.weight,
    })

    if (entry.photo_front || entry.photo_side || entry.photo_back) {
      progressPhotos.push({
        date: entry.entry_date,
        front: entry.photo_front ?? undefined,
        side: entry.photo_side ?? undefined,
        back: entry.photo_back ?? undefined,
      })
    }

    if (coachComment) {
      coachComments.push({
        date: checkin?.reviewed_at ?? entry.entry_date,
        comment: coachComment,
        checkinId: entry.checkin_id,
      })
      milestones.push({
        id: `coach-${entry.checkin_id}`,
        type: 'coach_comment',
        title: 'Coach Feedback',
        description: coachComment.slice(0, 80),
        date: checkin?.reviewed_at ?? entry.entry_date,
        icon: '💬',
      })
    }
  }

  // Fallback for legacy weekly check-ins without journey_entries rows
  for (const checkin of weeklyCheckins) {
    if (journeyEntries.some((e) => e.checkin_id === checkin.id)) continue

    milestones.push({
      id: `checkin-${checkin.id}`,
      type: 'checkin',
      title: `Week ${checkin.coaching_week ?? weeklyCheckins.indexOf(checkin) + 1} Check-in`,
      description: checkin.notes?.slice(0, 80) ?? 'Weekly progress check-in submitted.',
      date: checkin.submitted_at,
      icon: '✅',
    })

    if (checkin.weight != null) {
      weightHistory.push({ date: checkin.submitted_at, weight: checkin.weight, source: 'checkin' })
    }

    if (checkin.progress_photo_front || checkin.progress_photo_side || checkin.progress_photo_back) {
      progressPhotos.push({
        date: checkin.submitted_at,
        front: checkin.progress_photo_front ?? undefined,
        side: checkin.progress_photo_side ?? undefined,
        back: checkin.progress_photo_back ?? undefined,
      })
    }

    const coachResponse = parseCoachResponse(checkin.coach_response)
    if (coachResponse.feedback) {
      coachComments.push({
        date: checkin.reviewed_at ?? checkin.submitted_at,
        comment: coachResponse.feedback,
        checkinId: checkin.id,
      })
    }
  }

  const totalMinutes = workouts.reduce((sum, w) => sum + (w.duration ?? 0), 0)
  const totalCalories = workouts.reduce((sum, w) => sum + (Number(w.calories) || 0), 0)
  const recentWorkouts = workouts.slice(-7).reverse().map((w) => ({
    id: w.id,
    name: w.name,
    duration: w.duration,
    date: w.date ?? w.created_at,
  }))

  const startWeight = weightHistory.length > 0 ? weightHistory[0].weight : null
  const currentWeight = weightHistory.length > 0 ? weightHistory[weightHistory.length - 1].weight : null
  const weightChange = startWeight != null && currentWeight != null ? currentWeight - startWeight : null

  const startDate = profile?.onboarding_completed_at
    ? new Date(profile.onboarding_completed_at)
    : new Date()
  const weeksActive = Math.max(1, Math.ceil((Date.now() - startDate.getTime()) / (7 * 24 * 60 * 60 * 1000)))

  milestones.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

  return {
    milestones,
    weeklyEntries: weeklyEntries.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
    weightHistory,
    measurements,
    progressPhotos,
    coachComments,
    stats: {
      totalCheckins: checkins.length,
      totalWorkouts: workouts.length,
      totalWorkoutMinutes: totalMinutes,
      totalWorkoutCalories: totalCalories,
      avgWorkoutDuration: workouts.length > 0 ? Math.round(totalMinutes / workouts.length) : 0,
      startWeight,
      currentWeight,
      weightChange,
      weeksActive,
    },
    recentWorkouts,
  }
}
