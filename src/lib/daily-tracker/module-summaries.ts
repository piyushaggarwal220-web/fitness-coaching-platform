import { getCategoryDisplayScores, splitSnapshot } from './display'
import type { DailyTrackerDay } from './types'

export type TrackerModuleId =
  | 'diet'
  | 'workout'
  | 'water'
  | 'steps'
  | 'sleep'
  | 'supplements'
  | 'cardio'

export type TrackerModuleSummary = {
  id: TrackerModuleId
  title: string
  icon: string
  href: string
  subtitle: string
  progress: number
  available: boolean
}

function formatLiters(ml: number): string {
  const liters = ml / 1000
  return liters % 1 === 0 ? `${liters}` : liters.toFixed(1)
}

export function buildModuleSummaries(day: DailyTrackerDay): TrackerModuleSummary[] {
  const sections = splitSnapshot(day.snapshot)
  const scores = getCategoryDisplayScores(day)
  const { completion } = day

  const modules: TrackerModuleSummary[] = []

  if (sections.meals.length > 0) {
    const selected = day.completion.selectedDietDay
    const activeMeals = selected
      ? sections.meals.filter((m) => m.dietDay === selected)
      : sections.meals.some((m) => m.dietDay)
        ? []
        : sections.meals
    const done = activeMeals.filter((m) => completion.meals?.[m.id]?.completed).length
    const dayLabel =
      day.snapshot.dietDays?.find((d) => d.key === selected)?.label ??
      activeMeals[0]?.dietDayLabel
    modules.push({
      id: 'diet',
      title: 'Diet Tracker',
      icon: '🥗',
      href: '/tracker/diet',
      subtitle: selected
        ? `${dayLabel ?? selected} · ${done} / ${activeMeals.length} meals`
        : sections.meals.some((m) => m.dietDay)
          ? 'Choose which day\'s diet you\'re following'
          : `${done} / ${sections.meals.length} meals completed`,
      progress: scores.diet,
      available: true,
    })
  }

  if (sections.workout) {
    const total = sections.workout.exercises.length
    const done = sections.workout.exercises.filter((ex) => completion.exercises?.[ex.id]?.completed).length
    const focus = sections.workout.focus ?? sections.workout.dayLabel ?? "Today's session"
    modules.push({
      id: 'workout',
      title: 'Workout Tracker',
      icon: '🏋️',
      href: '/tracker/workout',
      subtitle: `${focus} · ${done} / ${total} exercises`,
      progress: scores.workout,
      available: true,
    })
  }

  if (sections.water) {
    const ml = completion.water?.ml ?? 0
    modules.push({
      id: 'water',
      title: 'Water',
      icon: '💧',
      href: '/tracker/water',
      subtitle: `${formatLiters(ml)} / ${formatLiters(sections.water.targetMl)} L`,
      progress: scores.water,
      available: true,
    })
  }

  if (sections.steps) {
    const actual = completion.cardio?.[sections.steps.id]?.actual ?? 0
    const target = Number(sections.steps.target) || 10000
    modules.push({
      id: 'steps',
      title: 'Steps',
      icon: '🚶',
      href: '/tracker/steps',
      subtitle: `${actual.toLocaleString()} / ${target.toLocaleString()}`,
      progress: scores.steps,
      available: true,
    })
  }

  if (sections.sleep) {
    const hours = completion.sleep?.hours
    const goal = sections.sleep.targetHours ?? 8
    modules.push({
      id: 'sleep',
      title: 'Sleep',
      icon: '😴',
      href: '/tracker/sleep',
      subtitle: hours != null ? `${hours} / ${goal} hrs` : `Goal ${goal} hrs`,
      progress: scores.sleep,
      available: true,
    })
  }

  if (sections.supplements.length > 0) {
    const done = sections.supplements.filter((s) => completion.supplements?.[s.id]?.completed).length
    modules.push({
      id: 'supplements',
      title: 'Supplements',
      icon: '💊',
      href: '/tracker/supplements',
      subtitle: `${done} / ${sections.supplements.length} complete`,
      progress: scores.supplements,
      available: true,
    })
  }

  if (sections.cardio.length > 0) {
    const done = sections.cardio.filter((c) => completion.cardio?.[c.id]?.completed).length
    const first = sections.cardio[0]!
    modules.push({
      id: 'cardio',
      title: 'Cardio',
      icon: '🏃',
      href: '/tracker/cardio',
      subtitle:
        sections.cardio.length === 1
          ? `${first.activity} · ${first.target} ${first.unit}`
          : `${done} / ${sections.cardio.length} sessions`,
      progress: scores.cardio,
      available: true,
    })
  }

  return modules
}
