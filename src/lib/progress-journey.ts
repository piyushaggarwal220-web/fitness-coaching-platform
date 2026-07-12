import type { SupabaseClient } from '@supabase/supabase-js'
import type { Checkin, Plan, Profile } from '@/types/database'

export type JourneyMilestone = {
  id: string
  type: 'onboarding' | 'plan' | 'checkin' | 'workout' | 'coach_comment'
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
  weight: number | null
}

export type ProgressJourneyData = {
  milestones: JourneyMilestone[]
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
  const [profileRes, checkinsRes, plansRes, workoutsRes] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', userId).single(),
    supabase
      .from('checkins')
      .select('*')
      .eq('client_id', userId)
      .order('submitted_at', { ascending: true }),
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
  const plans = (plansRes.data ?? []) as Plan[]
  const workouts = workoutsRes.data ?? []

  const milestones: JourneyMilestone[] = []
  const weightHistory: WeightEntry[] = []
  const measurements: MeasurementEntry[] = []
  const progressPhotos: ProgressJourneyData['progressPhotos'] = []
  const coachComments: ProgressJourneyData['coachComments'] = []

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
    milestones.push({
      id: `checkin-${checkin.id}`,
      type: 'checkin',
      title: `Week ${checkins.indexOf(checkin) + 1} Check-in`,
      description: checkin.notes?.slice(0, 80) ?? 'Weekly progress check-in submitted.',
      date: checkin.submitted_at,
      icon: '✅',
    })

    if (checkin.weight != null) {
      weightHistory.push({ date: checkin.submitted_at, weight: checkin.weight, source: 'checkin' })
    }

    measurements.push({
      date: checkin.submitted_at,
      waist: checkin.waist,
      weight: checkin.weight,
    })

    if (checkin.progress_photo_front || checkin.progress_photo_side || checkin.progress_photo_back) {
      progressPhotos.push({
        date: checkin.submitted_at,
        front: checkin.progress_photo_front ?? undefined,
        side: checkin.progress_photo_side ?? undefined,
        back: checkin.progress_photo_back ?? undefined,
      })
    }

    if (checkin.coach_response) {
      try {
        const parsed = JSON.parse(checkin.coach_response)
        const feedback = parsed.feedback ?? checkin.coach_response
        coachComments.push({
          date: checkin.reviewed_at ?? checkin.submitted_at,
          comment: feedback,
          checkinId: checkin.id,
        })
        milestones.push({
          id: `coach-${checkin.id}`,
          type: 'coach_comment',
          title: 'Coach Feedback',
          description: feedback.slice(0, 80),
          date: checkin.reviewed_at ?? checkin.submitted_at,
          icon: '💬',
        })
      } catch {
        coachComments.push({
          date: checkin.reviewed_at ?? checkin.submitted_at,
          comment: checkin.coach_response,
          checkinId: checkin.id,
        })
      }
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
