import * as XLSX from 'xlsx'
import type { Checkin } from '@/types/database'
import type {
  DailyTrackerDay,
  TrackerCompletion,
  TrackerMealItem,
  TrackerSnapshot,
  TrackerWorkoutItem,
} from '@/lib/daily-tracker/types'

export type WeeklyWorkbookInput = {
  clientName: string
  clientEmail: string
  coachingWeek: number
  checkin: Checkin
  previousCheckin: Checkin | null
  trackerDays: DailyTrackerDay[]
  weekDates: string[]
}

function num(value: number | null | undefined): number | string {
  return value == null || !Number.isFinite(value) ? '' : value
}

function delta(current: number | null | undefined, previous: number | null | undefined): number | string {
  if (current == null || previous == null) return ''
  const change = Math.round((current - previous) * 10) / 10
  return change
}

function weekdayLabel(dateKey: string): string {
  const [year, month, day] = dateKey.split('-').map(Number)
  if (!year || !month || !day) return ''
  return new Date(Date.UTC(year, month - 1, day, 6, 30)).toLocaleDateString('en-IN', {
    weekday: 'short',
    timeZone: 'Asia/Kolkata',
  })
}

function snapshotMeals(snapshot: TrackerSnapshot): TrackerMealItem[] {
  return snapshot.items.filter((item): item is TrackerMealItem => item.type === 'meal')
}

function snapshotWorkouts(snapshot: TrackerSnapshot): TrackerWorkoutItem[] {
  return snapshot.items.filter((item): item is TrackerWorkoutItem => item.type === 'workout')
}

function mealCounts(day: DailyTrackerDay): { done: number; total: number } {
  const meals = snapshotMeals(day.snapshot)
  const selected = day.completion.selectedDietDay
  const visible = selected ? meals.filter((m) => m.dietDay === selected) : meals
  const done = visible.filter((m) => day.completion.meals?.[m.id]?.completed).length
  return { done, total: visible.length }
}

function waterMl(completion: TrackerCompletion): number | string {
  return completion.water?.ml ?? ''
}

function sleepHours(completion: TrackerCompletion): number | string {
  return completion.sleep?.hours ?? ''
}

function sessionMinutes(completion: TrackerCompletion): number | string {
  const seconds = completion.workoutSession?.durationSeconds
  if (seconds == null) return ''
  return Math.round(seconds / 60)
}

export function weeklyWorkbookFilename(clientName: string, coachingWeek: number): string {
  const safe = clientName.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '') || 'client'
  return `Lurvox-Week-${coachingWeek}-${safe}.xlsx`
}

export function buildWeeklyWorkbook(input: WeeklyWorkbookInput): Buffer {
  const { checkin: now, previousCheckin: prev } = input
  const checkinRows: (string | number)[][] = [
    ['Field', 'This week', 'Last week', 'Change'],
    ['Client', input.clientName, '', ''],
    ['Email', input.clientEmail, '', ''],
    ['Coaching week', input.coachingWeek, prev?.coaching_week ?? '', ''],
    ['Submitted', now.submitted_at, prev?.submitted_at ?? '', ''],
    ['Weight (kg)', num(now.weight), num(prev?.weight), delta(now.weight, prev?.weight)],
    ['Chest (cm)', num(now.chest), num(prev?.chest), delta(now.chest, prev?.chest)],
    ['Thigh (cm)', num(now.thigh), num(prev?.thigh), delta(now.thigh, prev?.thigh)],
    ['Navel / belly (cm)', num(now.navel), num(prev?.navel), delta(now.navel, prev?.navel)],
    ['Diet adherence /10', num(now.diet_adherence), num(prev?.diet_adherence), delta(now.diet_adherence, prev?.diet_adherence)],
    ['Workout adherence /10', num(now.workout_adherence), num(prev?.workout_adherence), delta(now.workout_adherence, prev?.workout_adherence)],
    ['Days followed diet', num(now.days_followed_diet), num(prev?.days_followed_diet), ''],
    ['Days followed workout', num(now.days_followed_workout), num(prev?.days_followed_workout), ''],
    ['Days followed sleep', num(now.days_followed_sleep), num(prev?.days_followed_sleep), ''],
    ['Days followed water', num(now.days_followed_water), num(prev?.days_followed_water), ''],
    ['Days followed steps', num(now.days_followed_steps), num(prev?.days_followed_steps), ''],
    ['Energy /10', num(now.energy_level), num(prev?.energy_level), ''],
    ['Sleep quality /10', num(now.sleep_quality), num(prev?.sleep_quality), ''],
    ['Stress /10', num(now.stress_level), num(prev?.stress_level), ''],
    ['Hunger /10', num(now.hunger_level), num(prev?.hunger_level), ''],
    ['Motivation /10', num(now.motivation_level), num(prev?.motivation_level), ''],
    ['Progress rating /10', num(now.progress_rating), num(prev?.progress_rating), ''],
    ['Progress notes', now.progress_notes ?? '', prev?.progress_notes ?? '', ''],
    ['Digestion', now.digestion ?? '', prev?.digestion ?? '', ''],
    ['Pain / injuries', now.pain_injuries ?? '', prev?.pain_injuries ?? '', ''],
    ['Cardio completed', now.cardio_completed ?? '', prev?.cardio_completed ?? '', ''],
    ['Photo front', now.progress_photo_front ?? '', prev?.progress_photo_front ?? '', ''],
    ['Photo side', now.progress_photo_side ?? '', prev?.progress_photo_side ?? '', ''],
    ['Photo back', now.progress_photo_back ?? '', prev?.progress_photo_back ?? '', ''],
  ]

  const byDate = new Map(input.trackerDays.map((day) => [day.log_date, day]))
  const dailyRows: (string | number)[][] = [
    [
      'Date',
      'Weekday',
      'Overall %',
      'Diet %',
      'Workout %',
      'Meals done',
      'Meals planned',
      'Water ml',
      'Sleep hours',
      'Workout minutes',
      'Logged?',
    ],
  ]
  const setRows: (string | number)[][] = [
    ['Date', 'Exercise', 'Set', 'Reps', 'Weight (kg)', 'Completed'],
  ]

  for (const date of input.weekDates) {
    const day = byDate.get(date)
    if (!day) {
      dailyRows.push([date, weekdayLabel(date), '', '', '', '', '', '', '', '', 'No'])
      continue
    }
    const meals = mealCounts(day)
    dailyRows.push([
      date,
      weekdayLabel(date),
      num(day.overall_percent),
      num(day.scores?.diet),
      num(day.scores?.workout),
      meals.done,
      meals.total,
      waterMl(day.completion),
      sleepHours(day.completion),
      sessionMinutes(day.completion),
      'Yes',
    ])

    for (const workout of snapshotWorkouts(day.snapshot)) {
      for (const exercise of workout.exercises) {
        const sets = day.completion.exercises?.[exercise.id]?.sets ?? []
        sets.forEach((set, index) => {
          setRows.push([
            date,
            exercise.name,
            index + 1,
            num(set.reps),
            num(set.weight),
            set.completed ? 'Yes' : 'No',
          ])
        })
      }
    }
  }

  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(checkinRows), 'Weekly check-in')
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(dailyRows), 'Daily tracker')
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(setRows), 'Workout sets')
  return Buffer.from(XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }))
}
